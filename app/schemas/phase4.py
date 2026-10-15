from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field, HttpUrl


class WishlistCreate(BaseModel):
    event_id: int


class WishlistResponse(BaseModel):
    id: int
    user_id: int
    event_id: int
    created_at: datetime
    event: dict
    model_config = ConfigDict(from_attributes=True)


class EventUpdateCreate(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    is_important: bool = False


class EventUpdateResponse(BaseModel):
    id: int
    event_id: int
    message: str
    is_important: bool
    created_at: datetime
    model_config = ConfigDict(from_attributes=True)


class UserProfileUpdate(BaseModel):
    username: str | None = Field(default=None, min_length=3, max_length=80)
    email: EmailStr | None = None
    location: str | None = Field(default=None, max_length=200)
    profile_image_url: HttpUrl | None = None


class ChatHistoryMessage(BaseModel):
    role: str = Field(pattern="^(user|assistant)$")
    content: str = Field(min_length=1, max_length=2000)


class ChatRequest(BaseModel):
    message: str = Field(min_length=1, max_length=2000)
    history: list[ChatHistoryMessage] = Field(default_factory=list, max_length=10)


class ChatResponse(BaseModel):
    response: str
