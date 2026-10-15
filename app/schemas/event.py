from datetime import datetime
from decimal import Decimal
from pydantic import BaseModel, Field, ConfigDict

class EventCreate(BaseModel):
    title: str = Field(min_length=2, max_length=200)
    description: str
    category: str
    location: str
    event_date: datetime
    ticket_price: Decimal = Field(gt=0)
    total_tickets: int = Field(gt=0, le=100000)
    banner_image: str | None = None

class EventUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=2, max_length=200)
    description: str | None = None
    category: str | None = None
    location: str | None = None
    event_date: datetime | None = None
    ticket_price: Decimal | None = Field(default=None, gt=0)
    total_tickets: int | None = Field(default=None, gt=0, le=100000)
    banner_image: str | None = None

class EventResponse(EventCreate):
    id: int
    available_tickets: int
    organizer_id: int | None
    event_status: str
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)
