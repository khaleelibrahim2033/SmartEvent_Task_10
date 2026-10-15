import os
import uuid
import qrcode
from pathlib import Path
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal, ROUND_HALF_UP
from fastapi import HTTPException
from app.models.coupon import Coupon
from app.models.booking import Booking
from app.models.event import Event
from app.models.notification import Notification
from app.models.ticket import Ticket

QR_DIR = Path(__file__).resolve().parent / "static" / "qr"
QR_DIR.mkdir(parents=True, exist_ok=True)

def validate_coupon(db, code: str, booking_amount: Decimal) -> tuple[Coupon, Decimal]:
    coupon = db.query(Coupon).filter(
        Coupon.coupon_code == code.strip().upper()
    ).first()
    if not coupon or not coupon.is_active:
        raise HTTPException(400, "Coupon code is invalid or inactive")
    expiry = coupon.expiry_date
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        raise HTTPException(400, "Coupon has expired")
    if coupon.usage_count >= coupon.usage_limit:
        raise HTTPException(400, "Coupon usage limit has been reached")
    if booking_amount < Decimal(coupon.minimum_booking_amount):
        raise HTTPException(400, "Booking amount does not meet the coupon minimum")
    value = Decimal(coupon.discount_value)
    discount = (
        booking_amount * value / Decimal("100")
        if coupon.discount_type == "PERCENTAGE"
        else value
    )
    discount = min(discount, booking_amount).quantize(
        Decimal("0.01"), rounding=ROUND_HALF_UP
    )
    return coupon, discount


def create_ticket(db, booking):
    # Check how many tickets already exist for this booking
    existing_count = (
        db.query(Ticket)
        .filter(Ticket.booking_id == booking.id)
        .count()
    )

    existing_ticket = (
        db.query(Ticket)
        .filter(Ticket.booking_id == booking.id)
        .order_by(Ticket.id.asc())
        .first()
    )

    created_tickets = []

    # Create any missing tickets
    for _ in range(existing_count, booking.ticket_quantity):
        code = f"SME-{uuid.uuid4().hex[:12].upper()}"
        filename = f"{code}.png"
        filepath = QR_DIR / filename

        qr = qrcode.make(code)
        qr.save(filepath)

        base_url = os.getenv(
            "BACKEND_URL",
            "http://127.0.0.1:8000"
        )

        ticket = Ticket(
            booking_id=booking.id,
            ticket_code=code,
            qr_code_url=f"{base_url}/static/qr/{filename}",
        )

        db.add(ticket)
        created_tickets.append(ticket)

    # Preserve a single-ticket return value for compatibility
    return existing_ticket or (
        created_tickets[0] if created_tickets else None
    )


def event_lifecycle_status(event: Event, now: datetime | None = None) -> str:
    if event.event_status == "CANCELLED":
        return "CANCELLED"

    current = now or datetime.now(timezone.utc)
    event_date = event.event_date
    if event_date.tzinfo is None:
        event_date = event_date.replace(tzinfo=timezone.utc)
    else:
        event_date = event_date.astimezone(timezone.utc)

    if event_date.date() == current.date():
        return "ONGOING"
    if event_date > current:
        return "UPCOMING"
    return "COMPLETED"


def refresh_event_statuses(db, events: list[Event]) -> None:
    changed = False
    for event in events:
        status = event_lifecycle_status(event)
        if event.event_status != status:
            event.event_status = status
            changed = True
    if changed:
        db.commit()


def notify_event_attendees(db, event: Event, title: str, message: str) -> None:
    user_ids = (
        db.query(Booking.user_id)
        .filter(
            Booking.event_id == event.id,
            Booking.booking_status == "CONFIRMED",
        )
        .distinct()
        .all()
    )
    for (user_id,) in user_ids:
        db.add(Notification(
            user_id=user_id,
            title=title,
            message=message,
            type="EVENT",
        ))


def booking_date_filters(query, start_date: date | None, end_date: date | None):
    if start_date:
        query = query.filter(
            Booking.created_at >= datetime.combine(start_date, time.min)
        )
    if end_date:
        query = query.filter(
            Booking.created_at < datetime.combine(end_date + timedelta(days=1), time.min)
        )
    return query
