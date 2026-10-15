from datetime import datetime, timezone
from sqlalchemy import Boolean, Column, Integer, String, DateTime, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Ticket(Base):
    __tablename__ = "tickets"

    id = Column(Integer, primary_key=True, index=True)
    booking_id = Column(Integer, ForeignKey("bookings.id"), nullable=False, index=True)
    ticket_code = Column(String(100), unique=True, nullable=False, index=True)
    qr_code_url = Column(String(500), nullable=False)
    checked_in = Column(Boolean, nullable=False, default=False)
    checked_in_at = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    booking = relationship("Booking", back_populates="tickets")
