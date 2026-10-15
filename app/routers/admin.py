from collections import defaultdict
from datetime import date, datetime, timezone
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import require_roles
from app.database import get_db
from app.models.booking import Booking
from app.models.event import Event
from app.models.coupon import Coupon
from app.models.user import User
from app.schemas.admin import RoleUpdate
from app.schemas.auth import UserResponse
from app.schemas.booking import BookingResponse
from app.schemas.coupon import CouponCreate, CouponResponse
from app.schemas.event import EventResponse
from app.services import booking_date_filters, refresh_event_statuses

router = APIRouter(prefix="/api/admin", tags=["Administration"])


def filtered_bookings(db: Session, start_date: date | None, end_date: date | None):
    return booking_date_filters(db.query(Booking), start_date, end_date)


def validate_date_range(start_date: date | None, end_date: date | None):
    if start_date and end_date and start_date > end_date:
        raise HTTPException(422, "start_date must be on or before end_date")


@router.get("/users", response_model=list[UserResponse])
def all_users(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    return db.query(User).order_by(User.created_at.desc()).all()


@router.patch("/users/{user_id}/role", response_model=UserResponse)
def update_user_role(
    user_id: int,
    data: RoleUpdate,
    db: Session = Depends(get_db),
    admin: User = Depends(require_roles("ADMIN")),
):
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(404, "User not found")
    if user.id == admin.id and data.role != "ADMIN":
        raise HTTPException(400, "You cannot remove your own administrator role")
    if user.role == "ADMIN" and data.role != "ADMIN":
        admin_count = db.query(User).filter(User.role == "ADMIN").count()
        if admin_count <= 1:
            raise HTTPException(400, "The last administrator cannot be demoted")
    user.role = data.role
    db.commit()
    db.refresh(user)
    return user


@router.get("/events", response_model=list[EventResponse])
def all_events(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    events = db.query(Event).order_by(Event.event_date.desc()).all()
    refresh_event_statuses(db, events)
    return events


@router.get("/bookings")
def all_bookings(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    validate_date_range(start_date, end_date)
    rows = filtered_bookings(db, start_date, end_date).filter(
        Booking.booking_status == "CONFIRMED"
    ).order_by(Booking.created_at.desc()).all()
    return [{
        **BookingResponse.model_validate(booking).model_dump(),
        "username": booking.user.username,
        "event_title": booking.event.title,
    } for booking in rows]


@router.get("/analytics")
def analytics(
    start_date: date | None = None,
    end_date: date | None = None,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    validate_date_range(start_date, end_date)
    bookings = filtered_bookings(db, start_date, end_date).filter(
        Booking.booking_status == "CONFIRMED"
    ).all()
    daily_sales: dict[str, dict[str, int]] = defaultdict(lambda: {"tickets_sold": 0, "bookings": 0})
    monthly_bookings: dict[str, int] = defaultdict(int)
    popularity: dict[int, dict] = {}
    revenue: dict[int, Decimal] = defaultdict(lambda: Decimal("0"))

    for booking in bookings:
        created = booking.created_at
        if created.tzinfo is not None:
            created = created.astimezone(timezone.utc).replace(tzinfo=None)
        day = created.date().isoformat()
        month = created.strftime("%Y-%m")
        daily_sales[day]["tickets_sold"] += booking.ticket_quantity
        daily_sales[day]["bookings"] += 1
        monthly_bookings[month] += 1

        event = booking.event
        stats = popularity.setdefault(event.id, {
            "event_id": event.id,
            "event_title": event.title,
            "tickets_sold": 0,
            "booking_count": 0,
        })
        stats["tickets_sold"] += booking.ticket_quantity
        stats["booking_count"] += 1
        revenue[event.id] += Decimal(booking.final_amount)

    top_popular = sorted(
        popularity.values(),
        key=lambda item: (item["tickets_sold"], item["booking_count"]),
        reverse=True,
    )[:10]
    top_revenue = sorted(
        [{
            **popularity[event_id],
            "revenue": amount,
        } for event_id, amount in revenue.items()],
        key=lambda item: item["revenue"],
        reverse=True,
    )[:10]

    events = db.query(Event).all()
    refresh_event_statuses(db, events)
    return {
        "total_users": db.query(User).count(),
        "total_events": db.query(Event).count(),
        "total_tickets_sold": sum(booking.ticket_quantity for booking in bookings),
        "total_bookings": len(bookings),
        "platform_revenue": sum(
            (Decimal(booking.final_amount) for booking in bookings),
            Decimal("0"),
        ),
        "daily_ticket_sales": [
            {"date": day, **values}
            for day, values in sorted(daily_sales.items())
        ],
        "monthly_booking_trends": [
            {"month": month, "bookings": count}
            for month, count in sorted(monthly_bookings.items())
        ],
        "most_popular_events": top_popular,
        "top_revenue_events": top_revenue,
    }


@router.get("/coupons", response_model=list[CouponResponse])
def list_coupons(
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    return db.query(Coupon).order_by(Coupon.created_at.desc()).all()


@router.post("/coupons", response_model=CouponResponse, status_code=201)
def create_coupon(
    data: CouponCreate,
    db: Session = Depends(get_db),
    _: User = Depends(require_roles("ADMIN")),
):
    code = data.coupon_code.strip().upper()
    if db.query(Coupon.id).filter(Coupon.coupon_code == code).first():
        raise HTTPException(409, "Coupon code already exists")
    expiry = data.expiry_date
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=timezone.utc)
    if expiry <= datetime.now(timezone.utc):
        raise HTTPException(422, "Coupon expiry date must be in the future")
    if data.discount_type == "PERCENTAGE" and data.discount_value > 100:
        raise HTTPException(422, "Percentage discount cannot exceed 100")
    coupon = Coupon(
        **data.model_dump(exclude={"coupon_code"}),
        coupon_code=code,
    )
    db.add(coupon)
    db.commit()
    db.refresh(coupon)
    return coupon
