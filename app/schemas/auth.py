from datetime import datetime
from pydantic import BaseModel, EmailStr, Field

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=80)
    email: EmailStr
    password: str = Field(min_length=6, max_length=128)

class LoginRequest(BaseModel):
    identifier: str | None = Field(default=None, min_length=1, max_length=255)
    email: EmailStr | None = None
    username: str | None = Field(default=None, min_length=1, max_length=80)
    password: str = Field(min_length=1, max_length=128)

class UserResponse(BaseModel):
    id: int
    username: str
    email: EmailStr
    role: str
    location: str | None = None
    profile_image_url: str | None = None
    created_at: datetime

    class Config:
        from_attributes = True

class TokenResponse(BaseModel):
    access_token: str
    token_type: str
    user: UserResponse
