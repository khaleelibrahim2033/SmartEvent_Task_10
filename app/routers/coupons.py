from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.event import Event
from app.models.user import User
from app.schemas.coupon import CouponValidate
from app.services import validate_coupon

router = APIRouter(prefix="/api/coupons", tags=["Coupons"])


@router.post("/validate")
def validate_coupon_code(
    data: CouponValidate,
    db: Session = Depends(get_db),
    _: User = Depends(get_current_user),
):
    event = db.query(Event).filter(Event.id == data.event_id).first()
    if not event:
        raise HTTPException(404, "Event not found")
    amount = Decimal(str(event.ticket_price)) * data.ticket_quantity
    coupon, discount = validate_coupon(db, data.coupon_code, amount)
    return {
        "coupon_id": coupon.id,
        "coupon_code": coupon.coupon_code,
        "discount_amount": discount,
        "final_amount": amount - discount,
    }
