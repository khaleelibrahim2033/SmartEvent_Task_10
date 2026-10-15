from datetime import datetime, timezone
from sqlalchemy import Column, Integer, String, Text, DateTime, Numeric, ForeignKey
from sqlalchemy.orm import relationship
from app.database import Base

class Event(Base):
    __tablename__ = "events"

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(200), nullable=False, index=True)
    description = Column(Text, nullable=False)
    category = Column(String(30), nullable=False, index=True)
    location = Column(String(200), nullable=False)
    event_date = Column(DateTime, nullable=False, index=True)
    ticket_price = Column(Numeric(10, 2), nullable=False)
    total_tickets = Column(Integer, nullable=False, default=100)
    available_tickets = Column(Integer, nullable=False, default=100)
    banner_image = Column(String(500), nullable=True)
    organizer_id = Column(Integer, ForeignKey("users.id"), nullable=True, index=True)
    event_status = Column(String(20), nullable=False, default="UPCOMING", server_default="UPCOMING")
    created_at = Column(DateTime, default=lambda: datetime.now(timezone.utc), nullable=False)

    bookings = relationship("Booking", back_populates="event")
    reviews = relationship("Review", back_populates="event", cascade="all, delete-orphan")
    organizer = relationship("User", backref="organized_events")
