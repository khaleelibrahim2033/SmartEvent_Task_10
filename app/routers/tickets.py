from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user, require_roles
from app.models.event import Event
from app.models.user import User
from app.models.ticket import Ticket
from app.models.booking import Booking
from app.schemas.ticket import TicketResponse

router = APIRouter(prefix="/api/tickets", tags=["Tickets"])

@router.get("/", response_model=list[TicketResponse])
def my_tickets(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return (
        db.query(Ticket)
        .join(Booking, Ticket.booking_id == Booking.id)
        .filter(Booking.user_id == user.id)
        .order_by(Ticket.created_at.desc())
        .all()
    )

@router.get("/verify/{ticket_code}")
def verify_ticket(ticket_code: str, db: Session = Depends(get_db)):
    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(404, "Invalid ticket")
    return {
        "valid": True,
        "ticket_code": ticket.ticket_code,
        "booking_id": ticket.booking_id,
        "message": "Ticket verified successfully",
    }


@router.post("/verify/{ticket_code}/check-in")
def check_in_ticket(
    ticket_code: str,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    ticket = db.query(Ticket).filter(Ticket.ticket_code == ticket_code).first()
    if not ticket:
        raise HTTPException(404, "Invalid ticket")
    booking = db.query(Booking).filter(Booking.id == ticket.booking_id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    event = db.query(Event).filter(Event.id == booking.event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    if user.role == "ORGANIZER" and event.organizer_id != user.id:
        raise HTTPException(403, "You can only check in tickets for your own events")
    if user.role not in {"ORGANIZER", "ADMIN"}:
        raise HTTPException(403, "Organizer or administrator access is required")
    if booking.booking_status != "CONFIRMED":
        raise HTTPException(400, "Ticket booking is not confirmed")
    if ticket.checked_in:
        return {"valid": True, "checked_in": True, "message": "Ticket was already checked in"}
    ticket.checked_in = True
    ticket.checked_in_at = datetime.now(timezone.utc)
    db.commit()
    return {"valid": True, "checked_in": True, "message": "Ticket checked in successfully"}
