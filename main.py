import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import inspect, text

from app.database import Base, engine
from app.routers import admin, assistant, auth, bookings, coupons, events, notifications, organizer, payments, phase4, reviews, tickets
Base.metadata.create_all(bind=engine)


def upgrade_phase_two_schema():
    inspector = inspect(engine)
    additions = {
        "users": {
            "role": "VARCHAR(20) NOT NULL DEFAULT 'USER'",
            "location": "VARCHAR(200)",
            "profile_image_url": "VARCHAR(500)",
        },
        "events": {
            "organizer_id": "INTEGER",
            "event_status": "VARCHAR(20) NOT NULL DEFAULT 'UPCOMING'",
        },
        "bookings": {
            "coupon_id": "INTEGER",
            "discount_amount": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
            "final_amount": "NUMERIC(10, 2) NOT NULL DEFAULT 0",
        },
        "tickets": {
            "checked_in": "BOOLEAN NOT NULL DEFAULT 0",
            "checked_in_at": "DATETIME",
        },
    }
    with engine.begin() as connection:
        for table, columns in additions.items():
            existing = {column["name"] for column in inspector.get_columns(table)}
            for column, definition in columns.items():
                if column not in existing:
                    connection.execute(
                        text(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
                    )
        connection.execute(text(
            "UPDATE bookings SET final_amount = total_price "
            "WHERE final_amount = 0 AND total_price > 0"
        ))


upgrade_phase_two_schema()

app = FastAPI(title="SmartEvent API", version="2.0.0")

frontend_url = os.getenv("FRONTEND_URL", "http://localhost:5173")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[frontend_url, "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

os.makedirs("app/static/qr", exist_ok=True)
app.mount("/static", StaticFiles(directory="app/static"), name="static")

app.include_router(auth.router)
app.include_router(phase4.router)
app.include_router(events.router)
app.include_router(bookings.router)
app.include_router(payments.router)
app.include_router(coupons.router)
app.include_router(reviews.router)
app.include_router(tickets.router)
app.include_router(notifications.router)
app.include_router(organizer.router)
app.include_router(admin.router)
app.include_router(assistant.router)


@app.get("/")
def root():
    return {"message": "Welcome to SmartEvent API", "docs": "/docs"}


@app.get("/health")
def health():
    return {"status": "ok"}
