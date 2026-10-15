# SmartEvent API Endpoints

## Authentication
- POST `/api/auth/register`
- POST `/api/auth/login`
- GET `/api/auth/me`

## Events
- GET `/api/events/`
- GET `/api/events/categories`
- GET `/api/events/{event_id}`
- Public event responses include `event_status`: `UPCOMING`, `ONGOING`, `COMPLETED` or `CANCELLED`.

Query examples:
- `/api/events/?search=tech`
- `/api/events/?category=Music`
- `/api/events/?location=New%20York&date_from=2026-10-01&date_to=2026-10-31&sort=popularity`
- `sort` accepts `date`, `popularity`, or `price`.

## Bookings (JWT required)
- POST `/api/bookings/` — create a pending booking; optionally include `coupon_code`
- GET `/api/bookings/history`
- GET `/api/bookings/{booking_id}`

## Payments (JWT required)
- POST `/api/payments/bookings/{booking_id}` with `payment_method` of `CARD`, `UPI`, or `WALLET`
- GET `/api/payments/bookings/{booking_id}`
- The local test simulator outcome is controlled by `PAYMENT_SIMULATION_RESULT=SUCCESS|FAILED`.
- A successful payment confirms the booking and issues a ticket. A failed payment releases the reserved tickets.

## Coupons
- POST `/api/coupons/validate` — authenticated coupon validation against event and ticket quantity
- POST `/api/admin/coupons` — create a coupon (ADMIN JWT required)
- GET `/api/admin/coupons` — list coupons (ADMIN JWT required)
- Coupon codes are case-insensitive; discount values are percentage points or a fixed currency amount.

## Reviews
- GET `/api/reviews/events/{event_id}` — reviews and average rating
- POST `/api/reviews/events/{event_id}` — submit a rating (completed-event attendees only)
- PUT `/api/reviews/{review_id}` — edit your own review
- DELETE `/api/reviews/{review_id}` — delete your own review
- Attendance is recorded by ticket check-in; ticket purchase alone does not grant review eligibility.

## Tickets
- GET `/api/tickets/`
- GET `/api/tickets/verify/{ticket_code}`
- POST `/api/tickets/verify/{ticket_code}/check-in` — mark entry (organizer for their event or ADMIN)

## Notifications (JWT required)
- GET `/api/notifications/`
- GET `/api/notifications/unread-count`
- PATCH `/api/notifications/{notification_id}/read`
- PATCH `/api/notifications/read-all`
- Upcoming reminders are created when a user loads their notification list and has a confirmed booking within 24 hours.

## Organizer (ORGANIZER JWT required)
- POST `/api/organizer/events` — create an event owned by the current organizer
- GET `/api/organizer/events` — list owned events
- PATCH `/api/organizer/events/{event_id}` — update an owned event
- POST `/api/organizer/events/{event_id}/cancel` — cancel an owned event and notify attendees
- GET `/api/organizer/events/{event_id}/bookings` — list bookings for an owned event
- GET `/api/organizer/analytics` — per-event tickets, remaining capacity, revenue and booking counts

Organizer analytics accepts optional `start_date=YYYY-MM-DD` and `end_date=YYYY-MM-DD`.

## Administration (ADMIN JWT required)
- GET `/api/admin/users` — list users
- PATCH `/api/admin/users/{user_id}/role` — assign `USER`, `ORGANIZER` or `ADMIN`
- GET `/api/admin/events` — list all events
- GET `/api/admin/bookings` — list all bookings
- GET `/api/admin/analytics` — user/event totals, ticket and booking totals, revenue, daily sales,
  monthly trends, popular events and top revenue events

Admin analytics and bookings accept optional `start_date=YYYY-MM-DD` and `end_date=YYYY-MM-DD`.

New registrations are always `USER`. Provision the first administrator by setting `ADMIN_EMAIL`
and `ADMIN_PASSWORD` in `backend/.env` and running `python -m app.seed`.
