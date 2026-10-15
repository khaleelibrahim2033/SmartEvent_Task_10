from typing import Literal

from pydantic import BaseModel


class RoleUpdate(BaseModel):
    role: Literal["USER", "ORGANIZER", "ADMIN"]
