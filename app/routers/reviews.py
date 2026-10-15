from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.database import get_db
from app.models.booking import Booking
from app.models.event import Event
from app.models.review import Review
from app.models.ticket import Ticket
from app.models.user import User
from app.schemas.review import ReviewCreate
from app.services import event_lifecycle_status

router = APIRouter(prefix="/api/reviews", tags=["Reviews"])


def attended_event(db: Session, user_id: int, event_id: int) -> bool:
    event = db.query(Event).filter(Event.id == event_id).first()
    if not event or event_lifecycle_status(event) != "COMPLETED":
        return False
    return db.query(Booking.id).join(
        Ticket, Ticket.booking_id == Booking.id
    ).filter(
        Booking.user_id == user_id,
        Booking.event_id == event_id,
        Booking.booking_status == "CONFIRMED",
        Ticket.checked_in.is_(True),
    ).first() is not None


@router.get("/events/{event_id}")
def event_reviews(event_id: int, db: Session = Depends(get_db)):
    if not db.query(Event.id).filter(Event.id == event_id).first():
        raise HTTPException(404, "Event not found")
    rows = (
        db.query(Review, User.username)
        .join(User, Review.user_id == User.id)
        .filter(Review.event_id == event_id)
        .order_by(Review.created_at.desc())
        .all()
    )
    average = db.query(func.avg(Review.rating)).filter(
        Review.event_id == event_id
    ).scalar()
    return {
        "average_rating": float(average) if average is not None else None,
        "review_count": len(rows),
        "reviews": [{
            "id": review.id,
            "user_id": review.user_id,
            "event_id": review.event_id,
            "username": username,
            "rating": review.rating,
            "review_text": review.review_text,
            "created_at": review.created_at,
        } for review, username in rows],
    }


@router.post("/events/{event_id}", status_code=201)
def create_review(
    event_id: int,
    data: ReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    if not attended_event(db, user.id, event_id):
        raise HTTPException(403, "Only attendees of completed events can submit reviews")
    review = db.query(Review).filter(
        Review.user_id == user.id,
        Review.event_id == event_id,
    ).first()
    if review:
        raise HTTPException(409, "You have already reviewed this event")
    review = Review(user_id=user.id, event_id=event_id, **data.model_dump())
    db.add(review)
    db.commit()
    db.refresh(review)
    return {
        "id": review.id,
        "user_id": review.user_id,
        "event_id": review.event_id,
        "username": user.username,
        "rating": review.rating,
        "review_text": review.review_text,
        "created_at": review.created_at,
    }


@router.put("/{review_id}")
def update_review(
    review_id: int,
    data: ReviewCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == user.id,
    ).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if not attended_event(db, user.id, review.event_id):
        raise HTTPException(403, "Only attendees of completed events can edit reviews")
    review.rating = data.rating
    review.review_text = data.review_text
    db.commit()
    db.refresh(review)
    return {
        "id": review.id,
        "user_id": review.user_id,
        "event_id": review.event_id,
        "username": user.username,
        "rating": review.rating,
        "review_text": review.review_text,
        "created_at": review.created_at,
    }


@router.delete("/{review_id}", status_code=204)
def delete_review(
    review_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
):
    review = db.query(Review).filter(
        Review.id == review_id,
        Review.user_id == user.id,
    ).first()
    if not review:
        raise HTTPException(404, "Review not found")
    if not attended_event(db, user.id, review.event_id):
        raise HTTPException(403, "Only attendees of completed events can delete reviews")
    db.delete(review)
    db.commit()
