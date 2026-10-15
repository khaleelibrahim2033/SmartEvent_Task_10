import os
import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.booking import Booking
from app.models.coupon import Coupon
from app.models.event import Event
from app.models.notification import Notification
from app.models.payment import Payment
from app.models.user import User
from app.schemas.payment import PaymentProcess, PaymentResponse
from app.services import create_ticket, event_lifecycle_status
from app.routers.phase4 import availability_connections

router = APIRouter(prefix="/api/payments", tags=["Payments"])


@router.post("/bookings/{booking_id}", response_model=PaymentResponse)
async def process_payment(
    booking_id: int,
    data: PaymentProcess,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.user_id == user.id,
    ).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    if booking.booking_status != "PENDING":
        raise HTTPException(409, "This booking has already been processed")

    payment = (
        db.query(Payment)
        .filter(Payment.booking_id == booking.id, Payment.payment_status == "PENDING")
        .order_by(Payment.id.desc())
        .first()
    )
    if not payment:
        raise HTTPException(409, "No pending payment exists for this booking")
    if Decimal(payment.amount) != Decimal(booking.final_amount):
        raise HTTPException(409, "Payment amount does not match the booking total")

    configured_result = os.getenv("PAYMENT_SIMULATION_RESULT", "SUCCESS").upper()
    if configured_result not in {"SUCCESS", "FAILED"}:
        raise HTTPException(500, "PAYMENT_SIMULATION_RESULT must be SUCCESS or FAILED")

    payment.payment_method = data.payment_method
    payment.transaction_id = f"SIM-{uuid.uuid4().hex.upper()}"
    event = db.query(Event).filter(Event.id == booking.event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    event_available_for_payment = event_lifecycle_status(event) == "UPCOMING"
    result = configured_result if event_available_for_payment else "FAILED"
    payment.payment_status = result

    if result == "SUCCESS":
        booking.booking_status = "CONFIRMED"
        create_ticket(db, booking)
        message = f"Payment for '{event.title}' completed successfully."
        title = "Payment Successful"
    else:
        booking.booking_status = "FAILED"
        event.available_tickets += booking.ticket_quantity
        if booking.coupon_id:
            coupon = db.query(Coupon).filter(Coupon.id == booking.coupon_id).first()
            if coupon:
                coupon.usage_count = max(coupon.usage_count - 1, 0)
        if event_available_for_payment:
            message = f"Payment for '{event.title}' failed. Your ticket reservation was released."
            title = "Payment Failed"
        else:
            message = f"Booking for '{event.title}' could not be completed because the event is no longer available."
            title = "Booking Cancelled"

    db.add(Notification(
        user_id=user.id,
        title=title,
        message=message,
        type="PAYMENT",
    ))
    db.commit()
    db.refresh(payment)
    if result != "SUCCESS":
        await availability_connections.broadcast(event.id, event.available_tickets)
    return payment


@router.get("/bookings/{booking_id}", response_model=PaymentResponse)
def get_booking_payment(
    booking_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    booking = db.query(Booking).filter(
        Booking.id == booking_id,
        Booking.user_id == user.id,
    ).first()
    if not booking:
        raise HTTPException(404, "Booking not found")
    payment = (
        db.query(Payment)
        .filter(Payment.booking_id == booking.id)
        .order_by(Payment.id.desc())
        .first()
    )
    if not payment:
        raise HTTPException(404, "Payment not found")
    return payment
