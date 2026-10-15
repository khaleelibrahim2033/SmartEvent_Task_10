# SmartEvent Backend

FastAPI backend for the SmartEvent Event Discovery & Ticket Booking System.

## Features
- User registration and login
- bcrypt password hashing
- JWT authentication
- User profile
- Event discovery, search and category filtering
- Ticket booking and availability validation
- Booking history
- QR ticket generation
- Ticket verification
- Booking notifications
- Unread notification count and mark-as-read
- Test-mode payment simulation, coupon discounts, and attendee reviews
- Event filtering by location, date range, and popularity or price
- Staff ticket check-in for attendance verification; review eligibility requires check-in
- Phase 4 wishlist, personalized/trending event recommendations, live ticket availability, event announcements and user profiles
- Authenticated AI assistant using an optional OpenAI-compatible provider

## Run
```bash
cd backend
python -m venv venv
# Windows:
venv\Scripts\activate
pip install -r requirements.txt
copy .env.example .env
# Set a unique SECRET_KEY of at least 32 characters in .env.
# Set PAYMENT_SIMULATION_RESULT=SUCCESS or FAILED to exercise payment outcomes in the local simulator.
# Optionally set ADMIN_EMAIL and ADMIN_PASSWORD before seeding to provision an admin.
python -m app.seed
python -m uvicorn main:app --reload
```

Swagger: http://127.0.0.1:8000/docs

The default database is SQLite for easy setup. For MySQL, set DATABASE_URL in `.env`.

Public registration creates USER accounts only. An admin can promote accounts to ORGANIZER
or ADMIN through the admin API. Phase 2 endpoints are documented in `../docs/API_ENDPOINTS.md`.
Existing databases receive the role and event ownership/status columns at API startup.
The API also adds coupon and discount columns to existing bookings and creates the new payment,
coupon, and review tables automatically.
Phase 4 creates its wishlist, event view, and event update tables at startup and adds optional
profile location/image URL columns to existing users. For the AI assistant, configure
`OPENAI_API_KEY` and optionally `OPENAI_BASE_URL` / `OPENAI_MODEL`; the key remains server-side.
Event availability is broadcast over `/api/events/{event_id}/availability` WebSockets, with
the frontend falling back to polling if WebSockets are unavailable.
