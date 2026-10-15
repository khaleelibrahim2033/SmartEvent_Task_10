from datetime import datetime
from decimal import Decimal

from pydantic import BaseModel, ConfigDict, Field


class CouponValidate(BaseModel):
    coupon_code: str = Field(min_length=1, max_length=50)
    event_id: int
    ticket_quantity: int = Field(gt=0, le=20)


class CouponCreate(BaseModel):
    coupon_code: str = Field(min_length=2, max_length=50)
    discount_type: str = Field(pattern="^(PERCENTAGE|FIXED)$")
    discount_value: Decimal = Field(gt=0)
    minimum_booking_amount: Decimal = Field(default=0, ge=0)
    expiry_date: datetime
    usage_limit: int = Field(gt=0)
    is_active: bool = True


class CouponResponse(BaseModel):
    id: int
    coupon_code: str
    discount_type: str
    discount_value: Decimal
    minimum_booking_amount: Decimal
    expiry_date: datetime
    usage_limit: int
    usage_count: int
    is_active: bool
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
