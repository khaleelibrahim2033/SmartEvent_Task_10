from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field


class ReviewCreate(BaseModel):
    rating: int = Field(ge=1, le=5)
    review_text: str = Field(default="", max_length=2000)


class ReviewResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    username: str
    rating: int
    review_text: str
    created_at: datetime

    model_config = ConfigDict(from_attributes=True)
