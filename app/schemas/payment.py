from datetime import datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict


class PaymentProcess(BaseModel):
    payment_method: Literal["CARD", "UPI", "WALLET"]


class PaymentResponse(BaseModel):
    id: int
    booking_id: int
    payment_method: str
    payment_status: str
    transaction_id: str | None
    amount: Decimal
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
