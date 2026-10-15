from datetime import datetime, timezone
from decimal import Decimal
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, update
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user, require_roles
from app.models.user import User
from app.models.event import Event
from app.models.booking import Booking
from app.models.notification import Notification
from app.models.payment import Payment
from app.schemas.booking import BookingCreate, BookingResponse
from app.services import event_lifecycle_status, validate_coupon
from app.routers.phase4 import availability_connections

router = APIRouter(prefix="/api/bookings", tags=["Bookings"])

@router.post("/", response_model=BookingResponse, status_code=201)
async def create_booking(data: BookingCreate, db: Session = Depends(get_db), user: User = Depends(require_roles("USER"))):
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")

    event_status = event_lifecycle_status(event)
    if event_status != "UPCOMING":
        if event_status == "CANCELLED":
            raise HTTPException(400, "Cannot book a cancelled event")
        raise HTTPException(400, "Cannot book an event that has started or completed")
    reservation = db.execute(
        update(Event)
        .where(
            Event.id == event.id,
            Event.available_tickets >= data.ticket_quantity,
            Event.event_status != "CANCELLED",
            func.date(Event.event_date) > datetime.now(timezone.utc).date().isoformat(),
        )
        .values(available_tickets=Event.available_tickets - data.ticket_quantity)
        .execution_options(synchronize_session=False)
    )
    if reservation.rowcount != 1:
        db.rollback()
        db.refresh(event)
        raise HTTPException(409, f"Only {event.available_tickets} tickets are available")

    total = Decimal(str(event.ticket_price)) * data.ticket_quantity
    coupon = None
    discount = Decimal("0.00")
    if data.coupon_code:
        coupon, discount = validate_coupon(db, data.coupon_code, total)
        coupon.usage_count += 1
    booking = Booking(
        user_id=user.id,
        event_id=event.id,
        ticket_quantity=data.ticket_quantity,
        total_price=total,
        coupon_id=coupon.id if coupon else None,
        discount_amount=discount,
        final_amount=total - discount,
        booking_status="PENDING",
    )
    db.add(booking)
    db.flush()
    db.add(Payment(
        booking_id=booking.id,
        payment_method="UNSELECTED",
        payment_status="PENDING",
        amount=booking.final_amount,
    ))
    db.add(Notification(
        user_id=user.id,
        title="Booking Started",
        message=f"Your booking for '{event.title}' is waiting for payment.",
        type="BOOKING",
    ))
    db.commit()
    db.refresh(booking)
    await availability_connections.broadcast(event.id, event.available_tickets)
    return booking

@router.get("/history", response_model=list[BookingResponse])
def booking_history(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    return db.query(Booking).filter(Booking.user_id == user.id).order_by(Booking.created_at.desc()).all()

@router.get("/{booking_id}", response_model=BookingResponse)
def get_booking(booking_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    booking = db.query(Booking).filter(Booking.id == booking_id, Booking.user_id == user.id).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    return booking
