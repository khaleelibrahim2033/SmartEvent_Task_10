from collections import Counter
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import func
from sqlalchemy.orm import Session, joinedload

from app.auth import get_current_user, require_roles
from app.database import get_db
from app.database import SessionLocal
from app.models.booking import Booking
from app.models.event import Event
from app.models.event_update import EventUpdate
from app.models.event_view import EventView
from app.models.user import User
from app.models.wishlist import Wishlist
from app.schemas.auth import UserResponse
from app.schemas.event import EventResponse
from app.schemas.phase4 import (
    EventUpdateCreate,
    EventUpdateResponse,
    UserProfileUpdate,
    WishlistCreate,
)

router = APIRouter(prefix="/api", tags=["Phase 4"])


class AvailabilityConnections:
    def __init__(self):
        self.connections: dict[int, set[WebSocket]] = {}

    async def connect(self, event_id: int, websocket: WebSocket):
        await websocket.accept()
        self.connections.setdefault(event_id, set()).add(websocket)

    def disconnect(self, event_id: int, websocket: WebSocket):
        listeners = self.connections.get(event_id)
        if listeners:
            listeners.discard(websocket)
            if not listeners:
                self.connections.pop(event_id, None)

    async def broadcast(self, event_id: int, available_tickets: int):
        message = {"event_id": event_id, "available_tickets": available_tickets}
        for websocket in tuple(self.connections.get(event_id, ())):
            try:
                await websocket.send_json(message)
            except (OSError, RuntimeError, WebSocketDisconnect):
                self.disconnect(event_id, websocket)


availability_connections = AvailabilityConnections()


def event_payload(event: Event, **extra):
    return {**EventResponse.model_validate(event).model_dump(mode="json"), **extra}


@router.post("/events/{event_id}/view", status_code=204)
def record_event_view(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not db.query(Event.id).filter(Event.id == event_id).first():
        raise HTTPException(404, "Event not found")
    db.add(EventView(user_id=user.id, event_id=event_id))
    db.commit()


@router.get("/events/recommendations")
def recommendations(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    categories = [
        category for (category,) in db.query(Event.category)
        .join(EventView, EventView.event_id == Event.id)
        .filter(EventView.user_id == user.id)
        .all()
    ]
    categories.extend(
        category for (category,) in db.query(Event.category)
        .join(Booking, Booking.event_id == Event.id)
        .filter(Booking.user_id == user.id, Booking.booking_status == "CONFIRMED")
        .all()
    )
    preferred_categories = Counter(categories)
    popularity_by_event = dict(
        db.query(Booking.event_id, func.count(Booking.id))
        .filter(Booking.booking_status == "CONFIRMED")
        .group_by(Booking.event_id)
        .all()
    )
    events = db.query(Event).filter(
        Event.event_status != "CANCELLED",
        func.date(Event.event_date) >= date.today().isoformat(),
    ).all()

    def score(event: Event):
        category_score = preferred_categories[event.category]
        location_score = bool(
            user.location and user.location.casefold() in event.location.casefold()
        )
        popularity = popularity_by_event.get(event.id, 0)
        return category_score * 10 + int(location_score) * 5 + popularity

    events.sort(key=lambda event: (score(event), event.event_date), reverse=True)
    return [
        event_payload(event, reason="Based on your interests and event popularity")
        for event in events[:8]
    ]


@router.get("/events/trending")
def trending_events(db: Session = Depends(get_db)):
    events = (
        db.query(Event, func.count(Booking.id).label("booking_count"))
        .outerjoin(
            Booking,
            (Booking.event_id == Event.id) & (Booking.booking_status == "CONFIRMED"),
        )
        .filter(
            Event.event_status != "CANCELLED",
            func.date(Event.event_date) >= date.today().isoformat(),
        )
        .group_by(Event.id)
        .order_by(func.count(Booking.id).desc(), Event.event_date.asc())
        .limit(8)
        .all()
    )
    return [
        event_payload(event, booking_count=booking_count)
        for event, booking_count in events
    ]


@router.get("/wishlist")
def get_wishlist(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    items = (
        db.query(Wishlist)
        .options(joinedload(Wishlist.event))
        .filter(Wishlist.user_id == user.id)
        .order_by(Wishlist.created_at.desc())
        .all()
    )
    return [
        {
            "id": item.id,
            "user_id": item.user_id,
            "event_id": item.event_id,
            "created_at": item.created_at,
            "event": EventResponse.model_validate(item.event).model_dump(mode="json"),
        }
        for item in items
    ]


@router.post("/wishlist", status_code=201)
def add_to_wishlist(
    data: WishlistCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    item = db.query(Wishlist).filter(
        Wishlist.user_id == user.id,
        Wishlist.event_id == event.id,
    ).first()
    if item:
        return {"id": item.id, "event_id": event.id, "saved": True}
    item = Wishlist(user_id=user.id, event_id=event.id)
    db.add(item)
    db.commit()
    db.refresh(item)
    return {"id": item.id, "event_id": event.id, "saved": True}


@router.delete("/wishlist/{event_id}", status_code=204)
def remove_from_wishlist(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    item = db.query(Wishlist).filter(
        Wishlist.user_id == user.id,
        Wishlist.event_id == event_id,
    ).first()
    if not item:
        raise HTTPException(404, "Wishlist item not found")
    db.delete(item)
    db.commit()


@router.get("/events/{event_id}/updates", response_model=list[EventUpdateResponse])
def get_event_updates(event_id: int, db: Session = Depends(get_db)):
    if not db.query(Event.id).filter(Event.id == event_id).first():
        raise HTTPException(404, "Event not found")
    return (
        db.query(EventUpdate)
        .filter(EventUpdate.event_id == event_id)
        .order_by(EventUpdate.created_at.desc())
        .all()
    )


@router.post(
    "/events/{event_id}/updates",
    response_model=EventUpdateResponse,
    status_code=201,
)
def post_event_update(
    event_id: int,
    data: EventUpdateCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER", "ADMIN")),
):
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if user.role != "ADMIN" and event.organizer_id != user.id:
        raise HTTPException(404, "Event not found")
    update = EventUpdate(event_id=event.id, **data.model_dump())
    db.add(update)
    db.commit()
    db.refresh(update)
    return update


@router.get("/users/me", response_model=UserResponse)
def get_profile(user: User = Depends(get_current_user)):
    return user


@router.patch("/users/me", response_model=UserResponse)
def update_profile(
    data: UserProfileUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    changes = data.model_dump(exclude_unset=True)
    if "email" in changes and changes["email"] is not None:
        changes["email"] = str(changes["email"])
    for field in ("email", "username"):
        if field in changes and changes[field] is not None:
            duplicate = db.query(User.id).filter(
                func.lower(getattr(User, field)) == changes[field].casefold()
                if field == "email"
                else getattr(User, field) == changes[field],
                User.id != user.id,
            ).first()
            if duplicate:
                raise HTTPException(409, f"{field.capitalize()} is already registered")
    if not changes:
        return user
    for field, value in changes.items():
        setattr(user, field, str(value) if field == "profile_image_url" and value else value)
    db.commit()
    db.refresh(user)
    return user


@router.get("/users/me/activity")
def user_activity(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    bookings = db.query(Booking).filter(Booking.user_id == user.id).all()
    return {
        "booking_count": len(bookings),
        "confirmed_bookings": sum(booking.booking_status == "CONFIRMED" for booking in bookings),
        "tickets_booked": sum(
            booking.ticket_quantity
            for booking in bookings
            if booking.booking_status == "CONFIRMED"
        ),
        "wishlist_count": db.query(Wishlist).filter(Wishlist.user_id == user.id).count(),
        "recent_bookings": [
            {
                "id": booking.id,
                "event_id": booking.event_id,
                "status": booking.booking_status,
                "tickets": booking.ticket_quantity,
                "created_at": booking.created_at,
            }
            for booking in sorted(bookings, key=lambda item: item.created_at, reverse=True)[:5]
        ],
    }


@router.websocket("/events/{event_id}/availability")
async def event_availability(websocket: WebSocket, event_id: int):
    db = SessionLocal()
    try:
        event = db.query(Event).filter(Event.id == event_id).first()
        if not event:
            await websocket.close(code=1008, reason="Event not found")
            return
        await availability_connections.connect(event_id, websocket)
        await websocket.send_json({
            "event_id": event.id,
            "available_tickets": event.available_tickets,
        })
        while True:
            await websocket.receive_text()
    except WebSocketDisconnect:
        availability_connections.disconnect(event_id, websocket)
    finally:
        availability_connections.disconnect(event_id, websocket)
        db.close()
