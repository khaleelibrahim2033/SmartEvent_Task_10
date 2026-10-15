from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict

class BookingCreate(BaseModel):
    event_id: int
    ticket_quantity: int = Field(gt=0, le=20)
    coupon_code: str | None = Field(default=None, max_length=50)

class BookingResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    ticket_quantity: int
    total_price: Decimal
    coupon_id: int | None
    discount_amount: Decimal
    final_amount: Decimal
    booking_status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
