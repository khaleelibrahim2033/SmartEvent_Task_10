import json
import os
from urllib.error import HTTPError, URLError
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.booking import Booking
from app.models.event import Event
from app.models.user import User
from app.schemas.phase4 import ChatRequest, ChatResponse

router = APIRouter(prefix="/api/assistant", tags=["AI Assistant"])


def booking_answer(db: Session, user: User) -> str | None:
    bookings = (
        db.query(Booking)
        .filter(Booking.user_id == user.id)
        .order_by(Booking.created_at.desc())
        .limit(5)
        .all()
    )
    if not bookings:
        return "You don't have any bookings yet. Browse events to find something you'd enjoy."
    details = []
    for booking in bookings:
        event = db.query(Event).filter(Event.id == booking.event_id).first()
        title = event.title if event else f"Event #{booking.event_id}"
        details.append(f"{title}: {booking.booking_status}, {booking.ticket_quantity} ticket(s)")
    return "Here are your latest bookings: " + "; ".join(details)


@router.post("/chat", response_model=ChatResponse)
def chat(
    data: ChatRequest,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if any(word in data.message.casefold() for word in ("my booking", "my ticket", "my reservation")):
        return {"response": booking_answer(db, user)}

    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(503, "AI assistant is not configured. Set OPENAI_API_KEY on the server.")

    base_url = os.getenv("OPENAI_BASE_URL", "https://api.openai.com/v1").rstrip("/")
    parsed_base_url = urlsplit(base_url)
    local_http = (
        parsed_base_url.scheme == "http"
        and parsed_base_url.hostname in {"localhost", "127.0.0.1"}
    )
    if (
        not parsed_base_url.hostname
        or parsed_base_url.username
        or parsed_base_url.password
        or parsed_base_url.query
        or parsed_base_url.fragment
        or (parsed_base_url.scheme != "https" and not local_http)
    ):
        raise HTTPException(500, "OPENAI_BASE_URL must use HTTPS except for localhost development")
    model = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
    event_rows = (
        db.query(Event)
        .filter(Event.event_status != "CANCELLED")
        .order_by(Event.event_date.asc())
        .limit(30)
        .all()
    )
    catalog = [
        {
            "id": event.id,
            "title": event.title,
            "category": event.category,
            "location": event.location,
            "event_date": event.event_date.isoformat(),
            "ticket_price": str(event.ticket_price),
            "available_tickets": event.available_tickets,
        }
        for event in event_rows
    ]
    messages = [{
        "role": "system",
        "content": (
            "You are SmartEvent's helpful event discovery and ticket support assistant. "
            "Recommend only from this event catalog and never claim a booking action was completed. "
            "For ticket problems, explain that users can open Bookings or contact event support. "
            f"Current user profile location: {user.location or 'not provided'}. "
            f"Available event catalog (JSON): {json.dumps(catalog)}"
        ),
    }]
    messages.extend(
        {"role": item.role, "content": item.content}
        for item in data.history[-10:]
    )
    messages.append({"role": "user", "content": data.message})
    request = Request(
        f"{base_url}/chat/completions",
        data=json.dumps({
            "model": model,
            "messages": messages,
            "temperature": 0.4,
        }).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=30) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except HTTPError as error:
        raise HTTPException(502, "The AI assistant provider rejected the request") from error
    except (URLError, TimeoutError) as error:
        raise HTTPException(502, "The AI assistant provider is unavailable") from error
    except (json.JSONDecodeError, UnicodeDecodeError) as error:
        raise HTTPException(502, "The AI assistant provider returned an invalid response") from error

    choices = payload.get("choices")
    answer = choices[0].get("message", {}).get("content") if choices else None
    if not isinstance(answer, str) or not answer.strip():
        raise HTTPException(502, "The AI assistant provider returned no answer")
    return {"response": answer.strip()}
