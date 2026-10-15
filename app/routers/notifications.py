from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from app.database import get_db
from app.auth import get_current_user
from app.models.user import User
from app.models.notification import Notification
from app.models.booking import Booking
from app.models.event import Event
from app.schemas.notification import NotificationResponse

router = APIRouter(prefix="/api/notifications", tags=["Notifications"])

def create_due_reminders(db: Session, user_id: int) -> None:
    from datetime import datetime, timedelta, timezone

    now = datetime.now(timezone.utc)
    bookings = (
        db.query(Booking, Event)
        .join(Event, Booking.event_id == Event.id)
        .filter(
            Booking.user_id == user_id,
            Booking.booking_status == "CONFIRMED",
            Event.event_date >= now,
            Event.event_date <= now + timedelta(hours=24),
        )
        .all()
    )
    created = False
    for _, event in bookings:
        message = f"'{event.title}' starts within the next 24 hours."
        exists = db.query(Notification.id).filter(
            Notification.user_id == user_id,
            Notification.title == "Event Reminder",
            Notification.message == message,
        ).first()
        if not exists:
            db.add(Notification(
                user_id=user_id,
                title="Event Reminder",
                message=message,
                type="EVENT",
            ))
            created = True
    if created:
        db.commit()

@router.get("/", response_model=list[NotificationResponse])
def notifications(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    create_due_reminders(db, user.id)
    return db.query(Notification).filter(Notification.user_id == user.id).order_by(Notification.created_at.desc()).all()

@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    create_due_reminders(db, user.id)
    count = db.query(Notification).filter(Notification.user_id == user.id, Notification.is_read == False).count()
    return {"count": count}

@router.patch("/{notification_id}/read")
def mark_read(notification_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    item = db.query(Notification).filter(Notification.id == notification_id, Notification.user_id == user.id).first()
    if not item:
        raise HTTPException(404, "Notification not found")
    item.is_read = True
    db.commit()
    return {"message": "Notification marked as read"}

@router.patch("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)):
    db.query(Notification).filter(
        Notification.user_id == user.id,
        Notification.is_read == False,
    ).update({Notification.is_read: True}, synchronize_session=False)
    db.commit()
    return {"message": "All notifications marked as read"}
