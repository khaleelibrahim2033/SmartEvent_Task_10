import os
from datetime import datetime, timedelta, timezone
from app.auth import hash_password
from app.database import SessionLocal, engine, Base
from app.models.event import Event
from app.models.user import User

Base.metadata.create_all(bind=engine)
db = SessionLocal()
if db.query(Event).count() == 0:
    events = [
        Event(title="Tech Future Summit", description="A conference about AI, cloud and emerging technology.",
              category="Tech", location="Hyderabad", event_date=datetime.now(timezone.utc) + timedelta(days=20),
              ticket_price=799, total_tickets=200, available_tickets=200,
              banner_image="https://images.unsplash.com/photo-1540575467063-178a50c2df87?w=1200"),
        Event(title="Live Music Night", description="An evening of live music and entertainment.",
              category="Music", location="Bengaluru", event_date=datetime.now(timezone.utc) + timedelta(days=12),
              ticket_price=499, total_tickets=300, available_tickets=300,
              banner_image="https://images.unsplash.com/photo-1501386761578-eac5c94b800a?w=1200"),
        Event(title="City Sports Fest", description="Multi-sport event featuring football, cricket and athletics.",
              category="Sports", location="Chennai", event_date=datetime.now(timezone.utc) + timedelta(days=30),
              ticket_price=599, total_tickets=250, available_tickets=250,
              banner_image="https://images.unsplash.com/photo-1461896836934-ffe607ba8211?w=1200"),
        Event(title="Business Leaders Meetup", description="Networking and talks for founders and professionals.",
              category="Business", location="Mumbai", event_date=datetime.now(timezone.utc) + timedelta(days=25),
              ticket_price=999, total_tickets=150, available_tickets=150,
              banner_image="https://images.unsplash.com/photo-1511578314322-379afb476865?w=1200"),
    ]
    db.add_all(events)
    db.commit()

admin_email = os.getenv("ADMIN_EMAIL")
admin_password = os.getenv("ADMIN_PASSWORD")
if bool(admin_email) != bool(admin_password):
    db.close()
    raise ValueError("Set both ADMIN_EMAIL and ADMIN_PASSWORD to provision an administrator")
if admin_email and admin_password:
    admin = db.query(User).filter(User.email == admin_email).first()
    if admin:
        admin.role = "ADMIN"
    else:
        username = admin_email.split("@", 1)[0][:80]
        if db.query(User).filter(User.username == username).first():
            username = f"admin-{db.query(User).count() + 1}"
        db.add(User(
            username=username,
            email=admin_email,
            hashed_password=hash_password(admin_password),
            role="ADMIN",
        ))
    db.commit()
db.close()
print("Sample events inserted.")
