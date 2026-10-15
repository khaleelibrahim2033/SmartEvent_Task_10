from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.database import get_db
from app.models.booking import Booking
from app.models.event import Event
from app.models.user import User
from app.schemas.booking import BookingResponse
from app.schemas.event import EventCreate, EventResponse, EventUpdate
from app.services import booking_date_filters, notify_event_attendees, refresh_event_statuses

router = APIRouter(prefix="/api/organizer", tags=["Organizer"])


def owned_event(db: Session, event_id: int, organizer_id: int) -> Event:
    event = db.query(Event).filter(
        Event.id == event_id,
        Event.organizer_id == organizer_id,
    ).first()
    if not event:
        raise HTTPException(404, "Event not found")
    return event


@router.post("/events", response_model=EventResponse, status_code=201)
def create_event(
    data: EventCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    event_date = data.event_date
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    if event_date <= datetime.now(event_date.tzinfo):
        raise HTTPException(422, "Event date must be in the future")

    event = Event(
        **data.model_dump(),
        organizer_id=user.id,
        available_tickets=data.total_tickets,
        event_status="UPCOMING",
    )
    db.add(event)
    db.commit()
    db.refresh(event)
    return event


@router.get("/events", response_model=list[EventResponse])
def my_events(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    events = db.query(Event).filter(Event.organizer_id == user.id).order_by(Event.event_date).all()
    refresh_event_statuses(db, events)
    return events


@router.patch("/events/{event_id}", response_model=EventResponse)
def update_event(
    event_id: int,
    data: EventUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    event = owned_event(db, event_id, user.id)
    refresh_event_statuses(db, [event])
    if event.event_status in {"CANCELLED", "COMPLETED"}:
        raise HTTPException(400, "Cancelled or completed events cannot be edited")

    changes = data.model_dump(exclude_unset=True)
    if "event_date" in changes and changes["event_date"] is not None:
        event_date = changes["event_date"]
        if event_date.tzinfo is None:
            event_date = event_date.replace(tzinfo=timezone.utc)
        if event_date <= datetime.now(event_date.tzinfo):
            raise HTTPException(422, "Event date must be in the future")

    if "total_tickets" in changes and changes["total_tickets"] is not None:
        sold = event.total_tickets - event.available_tickets
        if changes["total_tickets"] < sold:
            raise HTTPException(422, "Ticket capacity cannot be lower than tickets already sold")
        event.available_tickets = changes["total_tickets"] - sold

    if not changes:
        return event

    for field, value in changes.items():
        if value is not None and field != "total_tickets":
            setattr(event, field, value)

    notify_event_attendees(
        db,
        event,
        "Event Updated",
        f"'{event.title}' has been updated. Please review the latest event details.",
    )
    db.commit()
    db.refresh(event)
    return event


@router.post("/events/{event_id}/cancel", response_model=EventResponse)
def cancel_event(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    event = owned_event(db, event_id, user.id)
    refresh_event_statuses(db, [event])
    if event.event_status == "COMPLETED":
        raise HTTPException(400, "Completed events cannot be cancelled")
    if event.event_status != "CANCELLED":
        event.event_status = "CANCELLED"
        notify_event_attendees(
            db,
            event,
            "Event Cancelled",
            f"'{event.title}' has been cancelled by the organizer.",
        )
        db.commit()
        db.refresh(event)
    return event


@router.get("/events/{event_id}/bookings", response_model=list[BookingResponse])
def event_bookings(
    event_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    owned_event(db, event_id, user.id)
    return (
        db.query(Booking)
        .filter(Booking.event_id == event_id)
        .order_by(Booking.created_at.desc())
        .all()
    )


@router.get("/analytics")
def organizer_analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ORGANIZER")),
):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")

    events = db.query(Event).filter(Event.organizer_id == user.id).all()
    refresh_event_statuses(db, events)
    event_ids = [event.id for event in events]
    query = (
        db.query(Booking)
        .filter(
            Booking.event_id.in_(event_ids),
            Booking.booking_status == "CONFIRMED",
        )
        if event_ids else None
    )
    if query is not None:
        bookings = booking_date_filters(query, start_date, end_date).all()
    else:
        bookings = []

    summaries = []
    for event in events:
        event_bookings = [booking for booking in bookings if booking.event_id == event.id]
        sold = sum(booking.ticket_quantity for booking in event_bookings)
        revenue = sum((Decimal(booking.final_amount) for booking in event_bookings), Decimal("0"))
        summaries.append({
            "event_id": event.id,
            "event_title": event.title,
            "event_status": event.event_status,
            "tickets_sold": sold,
            "remaining_tickets": event.available_tickets,
            "revenue": revenue,
            "booking_count": len(event_bookings),
        })

    return {
        "total_tickets_sold": sum(item["tickets_sold"] for item in summaries),
        "total_revenue": sum((item["revenue"] for item in summaries), Decimal("0")),
        "total_bookings": len(bookings),
        "events": summaries,
    }
