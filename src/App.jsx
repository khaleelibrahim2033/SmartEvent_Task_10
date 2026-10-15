import React, { useCallback, useEffect, useState } from 'react';
import {
  Link,
  Navigate,
  Route,
  Routes,
  useNavigate,
  useParams,
  useSearchParams
} from 'react-router-dom';

import api from './api';
import {
  ChatAssistant,
  EventUpdatesPanel,
  LiveEventPanel,
  PersonalizedSections,
  ProfilePage,
  WishlistButton,
  WishlistPage,
  WishlistProvider,
} from './Phase4';

function errorMessage(error, fallback) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg || 'Validation error').join(', ');
  }
  return typeof detail === 'string' ? detail : fallback;
}


// ==============================
// Protected Route
// ==============================

function ProtectedRoute({ children }) {
  return localStorage.getItem('smartevent_token')
    ? children
    : <Navigate to="/login" replace />;
}

function RoleRoute({ children, roles }) {
  if (!localStorage.getItem('smartevent_token')) {
    return <Navigate to="/login" replace />;
  }
  let role = 'USER';
  try {
    role = JSON.parse(localStorage.getItem('smartevent_user') || '{}').role || 'USER';
  } catch {
    role = 'USER';
  }
  return roles.includes(role) ? children : <Navigate to="/" replace />;
}

function NotificationBell() {
  const [count, setCount] = useState(0);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');

  const refresh = async () => {
    try {
      setError('');
      const [countResponse, itemsResponse] = await Promise.all([
        api.get('/notifications/unread-count'),
        api.get('/notifications/')
      ]);
      setCount(countResponse.data.count);
      setItems(itemsResponse.data.slice(0, 5));
    } catch (err) {
      setError(errorMessage(err, 'Unable to load notifications'));
      setCount(0);
      setItems([]);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const markRead = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      await refresh();
    } catch (err) {
      setError(errorMessage(err, 'Unable to update notification'));
    }
  };

  return (
    <div className="notification-menu">
      <button className="notification-trigger" onClick={() => setOpen(!open)} aria-expanded={open}>
        🔔<span className="notification-label">Notifications</span>
        {count > 0 && <span className="notification-count">{count}</span>}
      </button>
      {open && (
        <div className="notification-dropdown">
          {error && <p className="error">{error}</p>}
          {items.length === 0 && !error ? <p>No notifications yet.</p> : items.map((item) => (
            <div className={`notification-preview ${item.is_read ? 'read' : ''}`} key={item.id}>
              <strong>{item.title}</strong>
              <p>{item.message}</p>
              {!item.is_read && <button className="text-button" onClick={() => markRead(item.id)}>Mark read</button>}
            </div>
          ))}
          <Link to="/notifications" onClick={() => setOpen(false)}>View all notifications</Link>
        </div>
      )}
    </div>
  );
}

// ==============================
// Navbar
// ==============================


function Navbar() {
  const navigate = useNavigate();
  const token = localStorage.getItem('smartevent_token');

  let user = {};
  try {
    user = JSON.parse(
      localStorage.getItem('smartevent_user') || '{}'
    );
  } catch {
    user = {};
  }

  const role = String(user.role || 'USER').toUpperCase();
  const username =
    user.username || user.name || user.email || 'User';

  const logout = () => {
    localStorage.removeItem('smartevent_token');
    localStorage.removeItem('smartevent_user');
    navigate('/login');
  };

  return (
    <nav className="nav">
      <Link className="brand" to="/">
        SmartEvent
      </Link>

      <div className="navlinks">
        <Link to="/">Events</Link>

        {token && (
          <>
            <Link to="/bookings">Bookings</Link>
            <Link to="/wishlist">Wishlist</Link>
            <Link to="/tickets">Tickets</Link>
            <Link to="/profile">Profile</Link>
            <NotificationBell />
          </>
        )}

        {token && role === 'ORGANIZER' && (
          <>
            <Link to="/organizer">Organization</Link>
            <Link to="/organizer/events">My Events</Link>
          </>
        )}

        {token && role === 'ADMIN' && (
          <Link to="/admin">Admin</Link>
        )}

        {token ? (
          <>
            <span className="nav-username">
              👤 {username}
            </span>
            <button onClick={logout}>Logout</button>
          </>
        ) : (
          <Link to="/login">Login</Link>
        )}
      </div>
    </nav>
  );
}



// ==============================
// Authentication Page
// ==============================

function AuthPage({ mode }) {
  const isLogin = mode === 'login';
  const navigate = useNavigate();

  const [form, setForm] = useState({
    username: '',
    email: '',
    identifier: '',
    password: ''
  });

  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);


  // ============================
  // Submit
  // ============================

  const submit = async (e) => {
    e.preventDefault();

    setError('');
    setLoading(true);

    try {

      // ========================
      // LOGIN
      // ========================

      if (isLogin) {

        const formData = new URLSearchParams();

        formData.append('username', form.identifier);
        formData.append('password', form.password);

        const res = await api.post(
          '/auth/login',
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        localStorage.setItem(
          'smartevent_token',
          res.data.access_token
        );

        localStorage.setItem(
          'smartevent_user',
          JSON.stringify(res.data.user)
        );

      }

      // ========================
      // REGISTER
      // ========================

      else {

        await api.post('/auth/register', {
          username: form.username,
          email: form.email,
          password: form.password
        });


        // ======================
        // LOGIN AFTER REGISTER
        // ======================

        const formData = new URLSearchParams();

        formData.append('username', form.email);
        formData.append('password', form.password);

        const res = await api.post(
          '/auth/login',
          formData,
          {
            headers: {
              'Content-Type': 'application/x-www-form-urlencoded'
            }
          }
        );

        localStorage.setItem(
          'smartevent_token',
          res.data.access_token
        );

        localStorage.setItem(
          'smartevent_user',
          JSON.stringify(res.data.user)
        );
      }


      // ========================
      // GO HOME
      // ========================

      navigate('/');

    } catch (err) {

      console.error(
        'Login/Register error:',
        err
      );

      const detail = err.response?.data?.detail;

      if (Array.isArray(detail)) {

        setError(
          detail
            .map(
              (item) =>
                item.msg || 'Validation error'
            )
            .join(', ')
        );

      } else if (typeof detail === 'string') {

        setError(detail);

      } else {

        setError('Something went wrong');

      }

    } finally {

      setLoading(false);

    }
  };


  // ==============================
  // UI
  // ==============================

  return (
    <div className="auth card">

      <h1>
        {isLogin ? 'Login' : 'Create account'}
      </h1>

      <form onSubmit={submit}>

        {/* REGISTER USERNAME */}

        {!isLogin && (
          <input
            placeholder="Username"
            required
            minLength="3"
            value={form.username}
            onChange={(e) =>
              setForm({
                ...form,
                username: e.target.value
              })
            }
          />
        )}


        {/* LOGIN USERNAME / EMAIL */}

        {isLogin ? (

          <input
            placeholder="Username or email"
            required
            value={form.identifier}
            onChange={(e) =>
              setForm({
                ...form,
                identifier: e.target.value
              })
            }
          />

        ) : (

          <input
            type="email"
            placeholder="Email"
            required
            value={form.email}
            onChange={(e) =>
              setForm({
                ...form,
                email: e.target.value
              })
            }
          />

        )}


        {/* PASSWORD */}

        <input
          type="password"
          placeholder="Password"
          required
          minLength="6"
          value={form.password}
          onChange={(e) =>
            setForm({
              ...form,
              password: e.target.value
            })
          }
        />


        {/* ERROR */}

        {error && (
          <p className="error">
            {error}
          </p>
        )}


        {/* BUTTON */}

        <button disabled={loading}>

          {loading
            ? 'Please wait...'
            : isLogin
              ? 'Login'
              : 'Register'}

        </button>

      </form>


      {/* SWITCH LOGIN / REGISTER */}

      <p>

        {isLogin ? (

          <>
            New user?{' '}

            <Link to="/register">
              Register
            </Link>
          </>

        ) : (

          <>
            Already registered?{' '}

            <Link to="/login">
              Login
            </Link>
          </>

        )}

      </p>

    </div>
  );
}


// ==============================
// Home / Events
// ==============================

function Home() {
  const [events, setEvents] = useState([]);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [location, setLocation] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [minPrice, setMinPrice] = useState(0);
  const [maxPrice, setMaxPrice] = useState(10000);
  const [sort, setSort] = useState('date');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;

    const loadEvents = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await api.get('/events/', {
          params: {
            search: search.trim() || undefined,
            category: category || undefined,
            location: location.trim() || undefined,
            date_from: dateFrom || undefined,
            date_to: dateTo || undefined,
            min_price: minPrice > 0 ? minPrice : undefined,
            max_price: maxPrice < 10000 ? maxPrice : undefined,
            sort,
          },
        });

        if (active) {
          setEvents(response.data);
        }
      } catch (err) {
        if (active) {
          setEvents([]);
          setError(errorMessage(err, 'Unable to load events'));
        }
      } finally {
        if (active) {
          setLoading(false);
        }
      }
    };

    loadEvents();

    return () => {
      active = false;
    };
  }, [search, category, location, dateFrom, dateTo, minPrice, maxPrice, sort]);

  const filtersActive =
    search.trim() !== '' ||
    category !== '' ||
    location.trim() !== '' ||
    dateFrom !== '' ||
    dateTo !== '' ||
    minPrice > 0 ||
    maxPrice < 10000;

  const resetFilters = () => {
    setSearch('');
    setCategory('');
    setLocation('');
    setDateFrom('');
    setDateTo('');
    setMinPrice(0);
    setMaxPrice(10000);
    setSort('date');
  };

  return (
    <>
      <section className="hero">
        <h1>Discover your next event</h1>
        <p>Find events, book tickets and keep your digital tickets in one place.</p>
      </section>

      <div className="toolbar">
        <input
          placeholder="Search events..."
          aria-label="Search events"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <select
          aria-label="Filter by category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
        >
          <option value="">All categories</option>
          <option value="Music">Music</option>
          <option value="Tech">Tech</option>
          <option value="Sports">Sports</option>
          <option value="Business">Business</option>
        </select>

        <input
          aria-label="Filter by location"
          placeholder="Location"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
        />

        <label className="filter-date">
          From
          <input
            type="date"
            value={dateFrom}
            onChange={(e) => {
              setDateFrom(e.target.value);
              if (dateTo && e.target.value && dateTo < e.target.value) {
                setDateTo(e.target.value);
              }
            }}
          />
        </label>

        <label className="filter-date">
          To
          <input
            type="date"
            value={dateTo}
            min={dateFrom || undefined}
            onChange={(e) => setDateTo(e.target.value)}
          />
        </label>

        <label className="price-filter">
          Minimum price ₹{minPrice}
          <input
            type="range"
            min="0"
            max="10000"
            step="100"
            value={minPrice}
            onChange={(e) => setMinPrice(Math.min(Number(e.target.value), maxPrice))}
          />
        </label>

        <label className="price-filter">
          Maximum price ₹{maxPrice}
          <input
            type="range"
            min="0"
            max="10000"
            step="100"
            value={maxPrice}
            onChange={(e) => setMaxPrice(Math.max(Number(e.target.value), minPrice))}
          />
        </label>

        <select
          aria-label="Sort events"
          value={sort}
          onChange={(e) => setSort(e.target.value)}
        >
          <option value="date">Soonest</option>
          <option value="popularity">Popular</option>
          <option value="price">Lowest price</option>
        </select>
      </div>

      {!filtersActive && <PersonalizedSections />}

      <section className="event-results">
        {filtersActive && (
          <div className="page-heading">
            <h2>Search Results</h2>
            <button type="button" className="secondary" onClick={resetFilters}>
              Clear filters
            </button>
          </div>
        )}

        {error && <p className="error">{error}</p>}

        {loading ? (
          <div className="grid">
            {[1, 2, 3].map((item) => <div className="event-skeleton" key={item} />)}
          </div>
        ) : (
          <div className="grid">
            {events.map((event) => <EventCard key={event.id} event={event} />)}
          </div>
        )}

        {!loading && events.length === 0 && !error && (
          <p>No events match your filters. Try changing your search criteria.</p>
        )}
      </section>
    </>
  );
}


// ==============================
// Event Card
// ==============================
function EventCard({ event }) {

  return (
    <article className="event-card">
      <Link to={`/events/${event.id}`}>

      <img
        src={event.banner_image}
        alt={event.title}
      />

      <div className="event-body">

        <span className="tag">
          {event.category}
        </span>

          <span className={`tag status status-${(event.event_status || 'UPCOMING').toLowerCase()}`}>
            {event.event_status || 'UPCOMING'}
          </span>

        <h2>
          {event.title}
        </h2>

        <p>
          📍 {event.location}
        </p>

        <p>
          📅 {new Date(
            event.event_date
          ).toLocaleString()}
        </p>

        <p className={`status-notice status-${(event.event_status || 'UPCOMING').toLowerCase()}`}>
          Event status: {event.event_status || 'UPCOMING'}
        </p>

        {event.event_status === 'CANCELLED' && (
          <p className="error">This event has been cancelled. Ticket booking is unavailable.</p>
        )}

        <strong>
          ₹{event.ticket_price}
        </strong>

      </div>
      </Link>
      <div className="event-save"><WishlistButton eventId={event.id} /></div>
    </article>
  );
}


// ==============================
// Event Details
// ==============================

function EventDetails() {

  const { id } = useParams();
  const navigate = useNavigate();

  const [event, setEvent] = useState(null);
  const [qty, setQty] = useState(1);
  const [error, setError] = useState('');
  const updateAvailability = useCallback((available) => {
    setEvent((current) => current ? { ...current, available_tickets: available } : current);
  }, []);


  useEffect(() => {

    api.get(`/events/${id}`)

      .then((r) => {
        setEvent(r.data);
      })

      .catch((e) => {

        const detail = e.response?.data?.detail;

        if (Array.isArray(detail)) {
          setError(
            detail
              .map(
                (item) =>
                  item.msg || 'Validation error'
              )
              .join(', ')
          );
        } else if (typeof detail === 'string') {
          setError(detail);
        } else {
          setError('Event not found');
        }

      });

    if (localStorage.getItem('smartevent_token')) {
      api.post(`/events/${id}/view`).catch((err) => console.error('Unable to record event view:', err));
    }
  }, [id]);


  const book = async () => {

    if (!localStorage.getItem('smartevent_token')) {
      navigate('/login');
      return;
    }

    navigate(`/checkout?eventId=${id}&quantity=${qty}`);
  };


  if (error) {

    return (
      <p className="error">
        {error}
      </p>
    );

  }


  if (!event) {
    return <p>Loading...</p>;
  }


  return (
    <>
    <div className="detail card">

      <img
        className="detail-image"
        src={event.banner_image}
        alt={event.title}
      />

      <span className="tag">
        {event.category}
      </span>

      <h1>
        {event.title}
      </h1>

      <p>
        {event.description}
      </p>

      <p>
        📍 {event.location}
      </p>

      <p>
        📅 {new Date(
          event.event_date
        ).toLocaleString()}
      </p>

      <p className={`status-notice status-${(event.event_status || 'UPCOMING').toLowerCase()}`}>
        Event status: {event.event_status || 'UPCOMING'}
      </p>
      {event.event_status === 'CANCELLED' && (
        <p className="error">This event has been cancelled. Ticket booking is unavailable.</p>
      )}

      <h2>
        ₹{event.ticket_price}
      </h2>

      <LiveEventPanel eventId={Number(id)} availableTickets={event.available_tickets}
        onAvailabilityChange={updateAvailability} />


      <div className="book-row">

        <input
          type="number"
          min="1"
          max={Math.min(
            20,
            event.available_tickets
          )}
          value={qty}
          onChange={(e) =>
            setQty(Number(e.target.value))
          }
        />

        <button onClick={book} disabled={event.event_status !== 'UPCOMING' || event.available_tickets < 1 || qty < 1 || qty > event.available_tickets}>
          Book Tickets
        </button>

      </div>

    </div>
    <div className="detail-actions"><WishlistButton eventId={event.id} /></div>
    <EventUpdatesPanel eventId={event.id} eventOrganizerId={event.organizer_id} />
    <EventReviews eventId={Number(id)} />
    </>
  );
}

function EventReviews({ eventId }) {
  const [data, setData] = useState({ reviews: [], average_rating: null, review_count: 0 });
  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(null);
  const token = localStorage.getItem('smartevent_token');
  let userId = null;
  try {
    userId = JSON.parse(localStorage.getItem('smartevent_user') || '{}').id;
  } catch {
    userId = null;
  }

  const load = async () => {
    try {
      const response = await api.get(`/reviews/events/${eventId}`);
      setData(response.data);
    } catch (err) {
      setError(errorMessage(err, 'Unable to load event reviews'));
    }
  };

  useEffect(() => { load(); }, [eventId]);

  const saveReview = async (event) => {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      if (editing) {
        await api.put(`/reviews/${editing.id}`, { rating, review_text: reviewText });
      } else {
        await api.post(`/reviews/events/${eventId}`, { rating, review_text: reviewText });
      }
      setEditing(null);
      setReviewText('');
      setRating(5);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to save your review'));
    } finally {
      setSaving(false);
    }
  };

  const editReview = (review) => {
    setEditing(review);
    setRating(review.rating);
    setReviewText(review.review_text);
  };

  const deleteReview = async (reviewId) => {
    try {
      await api.delete(`/reviews/${reviewId}`);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to delete your review'));
    }
  };

  return (
    <section className="card review-section">
      <div className="page-heading">
        <div>
          <h2>Attendee reviews</h2>
          <p>{data.average_rating ? `${data.average_rating.toFixed(1)} / 5 · ` : ''}{data.review_count} reviews</p>
        </div>
      </div>
      {token && (
        <form className="review-form" onSubmit={saveReview}>
          <label>Your rating</label>
          <div className="star-picker" role="radiogroup" aria-label="Rating from 1 to 5">
            {[1, 2, 3, 4, 5].map((value) => (
              <button key={value} type="button" aria-label={`${value} stars`} aria-pressed={rating === value}
                className={value <= rating ? 'star selected' : 'star'} onClick={() => setRating(value)}>★</button>
            ))}
          </div>
          <textarea maxLength="2000" placeholder="Share your experience after attending..." value={reviewText}
            onChange={(event) => setReviewText(event.target.value)} />
          {error && <p className="error">{error}</p>}
          <div className="actions">
            <button disabled={saving}>{saving ? 'Saving...' : editing ? 'Update review' : 'Submit review'}</button>
            {editing && <button type="button" className="secondary" onClick={() => { setEditing(null); setReviewText(''); }}>Cancel</button>}
          </div>
          <small>Reviews are available to attendees of completed events.</small>
        </form>
      )}
      {data.reviews.map((review) => (
        <article className="review-item" key={review.id}>
          <div className="review-meta"><strong>{review.username}</strong><span className="review-stars">{'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}</span></div>
          <p>{review.review_text || 'No written comment.'}</p>
          <small>{new Date(review.created_at).toLocaleDateString()}</small>
          {review.user_id === userId && <div className="actions">
            <button className="secondary" onClick={() => editReview(review)}>Edit</button>
            <button className="danger" onClick={() => deleteReview(review.id)}>Delete</button>
          </div>}
        </article>
      ))}
      {!data.review_count && <p>No reviews yet. Attended this event? Be the first to review it.</p>}
    </section>
  );
}


function Checkout() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const eventId = Number(params.get('eventId'));
  const quantity = Number(params.get('quantity') || 1);
  const existingBookingId = params.get('bookingId');
  const [event, setEvent] = useState(null);
  const [booking, setBooking] = useState(null);
  const [couponCode, setCouponCode] = useState('');
  const [discount, setDiscount] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('CARD');
  const [error, setError] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
  const load = async () => {
    try {
      if (existingBookingId) {
        const response = await api.get(`/bookings/${existingBookingId}`);
        setBooking(response.data);

        const eventResponse = await api.get(
          `/events/${response.data.event_id}`
        );
        setEvent(eventResponse.data);
      } else if (eventId) {
        const response = await api.get(`/events/${eventId}`);
        setEvent(response.data);
      } else {
        setError('Choose an event before checkout.');
      }
    } catch (err) {
      setError(
        errorMessage(err, 'Unable to load checkout')
      );
    }
  };

  load();
}, [eventId, existingBookingId]);
  const validateCouponCode = async () => {
    setError('');
    try {
      const response = await api.post('/coupons/validate', {
        coupon_code: couponCode,
        event_id: eventId || booking.event_id,
        ticket_quantity: booking?.ticket_quantity || quantity
      });
      setDiscount(response.data);
    } catch (err) {
      setDiscount(null);
      setError(errorMessage(err, 'Coupon could not be applied'));
    }
  };

  const pay = async (formEvent) => {
    formEvent.preventDefault();
    setError('');
    setProcessing(true);
    try {
      let currentBooking = booking;
      if (!currentBooking) {
        const response = await api.post('/bookings/', {
          event_id: eventId,
          ticket_quantity: quantity,
          coupon_code: discount ? couponCode : undefined
        });
        currentBooking = response.data;
        setBooking(currentBooking);
      }
      const payment = await api.post(`/payments/bookings/${currentBooking.id}`, {
        payment_method: paymentMethod
      });
      navigate(`/payment-confirmation/${currentBooking.id}?status=${payment.data.payment_status}`);
    } catch (err) {
      setError(errorMessage(err, 'Payment could not be completed. You can retry this checkout.'));
    } finally {
      setProcessing(false);
    }
  };

  if (!event && !error) return <p>Loading checkout...</p>;
  if (!event) return <p className="error">{error}</p>;
  const subtotal = booking?.total_price ?? (Number(event.ticket_price) * quantity);
  const savings = booking?.discount_amount ?? discount?.discount_amount ?? 0;
  const amountDue = booking?.final_amount ?? discount?.final_amount ?? subtotal;

  return (
    <section className="checkout-layout">
      <div className="card">
        <span className="tag">Secure checkout · simulated test payment</span>
        <h1>Complete your booking</h1>
        <h2>{event.title}</h2>
        <p>{new Date(event.event_date).toLocaleString()} · {event.location}</p>
        <p>{booking?.ticket_quantity || quantity} ticket(s)</p>
        {!booking && (
          <div className="coupon-box">
            <label htmlFor="coupon-code">Promo code</label>
            <div className="book-row">
              <input id="coupon-code" value={couponCode} onChange={(e) => { setCouponCode(e.target.value); setDiscount(null); }} placeholder="Enter coupon code" />
              <button type="button" className="secondary" onClick={validateCouponCode} disabled={!couponCode}>Apply</button>
            </div>
          </div>
        )}
        <div className="price-breakdown">
          <p><span>Subtotal</span><strong>₹{Number(subtotal).toFixed(2)}</strong></p>
          <p><span>Discount</span><strong>-₹{Number(savings).toFixed(2)}</strong></p>
          <p className="total-line"><span>Total due</span><strong>₹{Number(amountDue).toFixed(2)}</strong></p>
        </div>
        <form onSubmit={pay}>
          <label className="form-field">Payment method
            <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value)}>
              <option value="CARD">Card (test)</option>
              <option value="UPI">UPI (test)</option>
              <option value="WALLET">Wallet (test)</option>
            </select>
          </label>
          {error && <p className="error">{error}</p>}
          <button disabled={processing}>{processing ? 'Processing payment...' : `Pay ₹${Number(amountDue).toFixed(2)}`}</button>
        </form>
      </div>
      <aside className="card checkout-note">
        <h3>Booking summary</h3>
        <p>Your tickets are issued after a successful payment.</p>
        <p>Transaction references are generated by the backend simulator. No real payment details are collected.</p>
      </aside>
    </section>
  );
}


// ==============================
// Booking Confirmation
// ==============================

function BookingConfirmation() {

  const { id } = useParams();

  const [booking, setBooking] = useState(null);
  const [payment, setPayment] = useState(null);
  const [error, setError] = useState('');


  useEffect(() => {

    Promise.all([
      api.get(`/bookings/${id}`),
      api.get(`/payments/bookings/${id}`)
    ]).then(([bookingResponse, paymentResponse]) => {
      setBooking(bookingResponse.data);
      setPayment(paymentResponse.data);
    }).catch((err) => setError(errorMessage(err, 'Unable to load payment confirmation')));

  }, [id]);

  if (error) {
    return <p className="error">{error}</p>;
  }
  if (!booking || !payment) {
    return <p>Loading...</p>;
  }

  const succeeded = payment.payment_status === 'SUCCESS';

  return (
    <div className={`card confirmation-card ${succeeded ? 'success' : 'failure'}`}>
      <span className="confirmation-icon">{succeeded ? '✓' : '!'}</span>
      <h1>{succeeded ? 'Payment successful' : 'Payment failed'}</h1>
      <p>{succeeded ? 'Your booking is confirmed and your digital ticket is ready.' : 'Your payment was not completed. The ticket reservation has been released.'}</p>
      <div className="confirmation-summary">
        <p>Booking ID <strong>#{booking.id}</strong></p>
        <p>Payment status <strong>{payment.payment_status}</strong></p>
        <p>Tickets <strong>{booking.ticket_quantity}</strong></p>
        <p>Discount <strong>₹{Number(booking.discount_amount).toFixed(2)}</strong></p>
        <p>Amount {succeeded ? 'paid' : 'attempted'} <strong>₹{Number(payment.amount).toFixed(2)}</strong></p>
        <p>Transaction reference <strong>{payment.transaction_id || 'Not available'}</strong></p>
      </div>
      <div className="actions">
        {succeeded && <Link className="button" to="/tickets">View Digital Ticket</Link>}
        {!succeeded && <Link className="button" to="/">Discover more events</Link>}
        <Link className="button secondary" to="/bookings">Booking history</Link>
      </div>
    </div>
  );
}


// ==============================
// Bookings
// ==============================

function Bookings() {

  const [items, setItems] = useState([]);


  useEffect(() => {

    api.get('/bookings/history')

      .then((r) => {
        setItems(r.data);
      });

  }, []);


  return (
    <div>

      <h1>
        Booking History
      </h1>

      <div className="list">

        {items.map((b) => (

          <div
            className="card"
            key={b.id}
          >

            <h3>
              Booking #{b.id}
            </h3>

            <p>
              Event ID: {b.event_id} ·
              Tickets: {b.ticket_quantity}
            </p>

            <p>
              Total: ₹{b.final_amount} ·
              {' '}
              {b.booking_status}
            </p>

          </div>

        ))}

      </div>

    </div>
  );
}


// ==============================
// Tickets
// ==============================

function Tickets() {

  const [items, setItems] = useState([]);


  useEffect(() => {

    api.get('/tickets/')

      .then((r) => {
        setItems(r.data);
      });

  }, []);


  return (
    <div>

      <h1>
        My Digital Tickets
      </h1>

      <div className="grid">

        {items.map((t) => (

          <div
            className="ticket card"
            key={t.id}
          >

            <h2>
              Ticket
            </h2>

            <p>
              Code:{' '}

              <strong>
                {t.ticket_code}
              </strong>
            </p>

            <img
              src={t.qr_code_url}
              alt="Ticket QR code"
            />

            <p>
              Scan this QR code at event entry.
            </p>

          </div>

        ))}

      </div>


      {items.length === 0 && (
        <p>
          No tickets yet.
        </p>
      )}

    </div>
  );
}


// ==============================
// Notifications
// ==============================

function Notifications() {

  const [items, setItems] = useState([]);
  const [error, setError] = useState('');


  const load = () => {

    api.get('/notifications/').then((r) => {
      setItems(r.data);
      setError('');
    }).catch((err) => setError(errorMessage(err, 'Unable to load notifications')));

  };


  useEffect(() => {
    load();
  }, []);


  const read = async (id) => {
    try {
      await api.patch(`/notifications/${id}/read`);
      load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to update notification'));
    }
  };

  const readAll = async () => {
    try {
      await api.patch('/notifications/read-all');
      load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to update notifications'));
    }
  };

  return (
    <div>

      <h1>
        Notifications
      </h1>

      {items.some((item) => !item.is_read) && <button onClick={readAll}>Mark all as read</button>}
      {error && <p className="error">{error}</p>}

      {items.map((n) => (

        <div
          className={`card notification ${
            n.is_read ? 'read' : ''
          }`}
          key={n.id}
        >

          <h3>
            {n.title}
          </h3>

          <span className="tag">{n.notification_type || n.type}</span>
          <p>
            {n.message}
          </p>


          {!n.is_read && (

            <button
              onClick={() => read(n.id)}
            >
              Mark as read
            </button>

          )}

        </div>

      ))}


      {items.length === 0 && (
        <p>
          No notifications.
        </p>
      )}

    </div>
  );
}


function OrganizerDashboard() {
  const [summary, setSummary] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/organizer/analytics')
      .then((analytics) => setSummary(analytics.data))
      .catch((err) => setError(errorMessage(err, 'Unable to load organizer analytics')));
  }, []);

  return (
    <section>
      <div className="page-heading">
        <div>
          <h1>Organizer Dashboard</h1>
          <p>Manage events and track ticket sales.</p>
        </div>
        <Link className="button" to="/organizer/events/new">Create event</Link>
      </div>
      <div className="toolbar">
        <Link className="button secondary" to="/organizer/events">Manage events</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {summary ? (
        <>
          <div className="kpi-grid">
            <Kpi title="Tickets sold" value={summary.total_tickets_sold} />
            <Kpi title="Bookings" value={summary.total_bookings} />
            <Kpi title="Revenue" value={`₹${Number(summary.total_revenue).toLocaleString()}`} />
            <Kpi title="Events" value={summary.events.length} />
          </div>
          <h2>Event performance</h2>
          <div className="grid">
            {summary.events.map((event) => (
              <article className="card" key={event.event_id}>
                <span className={`tag status status-${event.event_status.toLowerCase()}`}>
                  {event.event_status}
                </span>
                <h3>{event.event_title}</h3>
                <p>{event.tickets_sold} tickets sold · {event.booking_count} bookings</p>
                <p>{event.remaining_tickets} tickets remaining</p>
                <strong>Revenue: ₹{Number(event.revenue).toLocaleString()}</strong>
                <p><Link to={`/organizer/events/${event.event_id}/bookings`}>View bookings</Link></p>
              </article>
            ))}
          </div>
          {summary.events.length === 0 && <p>You have not created any events yet.</p>}
        </>
      ) : !error && <p>Loading organizer dashboard...</p>}
    </section>
  );
}

function OrganizerEvents() {
  const [events, setEvents] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = () => api.get('/organizer/events')
    .then((res) => setEvents(res.data))
    .catch((err) => setError(errorMessage(err, 'Unable to load your events')))
    .finally(() => setLoading(false));

  useEffect(() => { load(); }, []);

  const cancel = async (id) => {
    if (!window.confirm('Cancel this event? Booked attendees will be notified.')) return;
    setError('');
    try {
      await api.post(`/organizer/events/${id}/cancel`);
      await load();
    } catch (err) {
      setError(errorMessage(err, 'Unable to cancel event'));
    }
  };

  return (
    <section>
      <div className="page-heading">
        <h1>Manage Events</h1>
        <Link className="button" to="/organizer/events/new">Create event</Link>
      </div>
      {error && <p className="error">{error}</p>}
      {loading ? <p>Loading events...</p> : (
        <div className="list">
          {events.map((event) => (
            <article className="card event-management" key={event.id}>
              <div>
                <span className={`tag status status-${event.event_status.toLowerCase()}`}>{event.event_status}</span>
                <h2>{event.title}</h2>
                <p>{new Date(event.event_date).toLocaleString()} · {event.available_tickets}/{event.total_tickets} tickets left</p>
              </div>
              <div className="actions">
                <Link className="button secondary" to={`/organizer/events/${event.id}/edit`}>Edit</Link>
                <Link className="button secondary" to={`/organizer/events/${event.id}/bookings`}>Bookings</Link>
                {event.event_status !== 'CANCELLED' && event.event_status !== 'COMPLETED' && (
                  <button className="danger" onClick={() => cancel(event.id)}>Cancel</button>
                )}
              </div>
            </article>
          ))}
          {!events.length && <p>No events yet. Create your first event.</p>}
        </div>
      )}
    </section>
  );
}

const emptyEvent = {
  title: '',
  description: '',
  category: 'Music',
  location: '',
  event_date: '',
  ticket_price: '',
  total_tickets: '',
  banner_image: '',
};

function OrganizerEventForm({ editing = false }) {
  const { id } = useParams();
  const navigate = useNavigate();
  const [form, setForm] = useState(emptyEvent);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!editing) return;
    api.get('/organizer/events')
      .then(({ data }) => {
        const event = data.find((item) => item.id === Number(id));
        if (!event) {
          setError('Event not found');
          return;
        }
        setForm({
          ...event,
          event_date: new Date(event.event_date).toISOString().slice(0, 16),
        });
      })
      .catch((err) => setError(errorMessage(err, 'Unable to load event')));
  }, [editing, id]);

  const submit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    const payload = {
      ...form,
      event_date: new Date(form.event_date).toISOString(),
      ticket_price: Number(form.ticket_price),
      total_tickets: Number(form.total_tickets),
    };
    try {
      if (editing) await api.patch(`/organizer/events/${id}`, payload);
      else await api.post('/organizer/events', payload);
      navigate('/organizer/events');
    } catch (err) {
      setError(errorMessage(err, 'Unable to save event'));
    } finally {
      setSaving(false);
    }
  };

  const field = (key, label, props = {}) => (
    <label className="form-field" key={key}>
      {label}
      <input
        required={key !== 'banner_image'}
        type={props.type || 'text'}
        min={props.min}
        step={props.step}
        value={form[key] ?? ''}
        onChange={(event) => setForm({ ...form, [key]: event.target.value })}
      />
    </label>
  );

  return (
    <section className="card form-card">
      <h1>{editing ? 'Edit Event' : 'Create Event'}</h1>
      {error && <p className="error">{error}</p>}
      <form className="event-form" onSubmit={submit}>
        {field('title', 'Event title')}
        <label className="form-field">
          Description
          <textarea required rows="4" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </label>
        <label className="form-field">
          Category
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}>
            {['Music', 'Tech', 'Sports', 'Business', 'Other'].map((category) => <option key={category}>{category}</option>)}
          </select>
        </label>
        {field('location', 'Location')}
        {field('event_date', 'Date and time', { type: 'datetime-local' })}
        {field('ticket_price', 'Ticket price', { type: 'number', min: '0.01', step: '0.01' })}
        {field('total_tickets', 'Ticket capacity', { type: 'number', min: '1', step: '1' })}
        {field('banner_image', 'Banner image URL')}
        <div className="actions">
          <button disabled={saving}>{saving ? 'Saving...' : editing ? 'Save changes' : 'Create event'}</button>
          <Link className="button secondary" to="/organizer/events">Cancel</Link>
        </div>
      </form>
    </section>
  );
}

function OrganizerEventBookings() {
  const { id } = useParams();
  const [bookings, setBookings] = useState([]);
  const [event, setEvent] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get(`/organizer/events/${id}/bookings`),
      api.get('/organizer/events'),
    ])
      .then(([bookingResult, eventResult]) => {
        setBookings(bookingResult.data);
        setEvent(eventResult.data.find((item) => item.id === Number(id)));
      })
      .catch((err) => setError(errorMessage(err, 'Unable to load event bookings')));
  }, [id]);

  return (
    <section>
      <div className="page-heading">
        <h1>Event Bookings{event ? ` · ${event.title}` : ''}</h1>
        <Link className="button secondary" to="/organizer/events">Back to events</Link>
      </div>
      {error && <p className="error">{error}</p>}
      <div className="table-wrap">
        <table>
          <thead><tr><th>Booking</th><th>Attendee ID</th><th>Tickets</th><th>Total</th><th>Status</th><th>Booked</th></tr></thead>
          <tbody>
            {bookings.map((booking) => (
              <tr key={booking.id}>
                <td>#{booking.id}</td><td>{booking.user_id}</td><td>{booking.ticket_quantity}</td>
                <td>₹{booking.total_price}</td><td>{booking.booking_status}</td>
                <td>{new Date(booking.created_at).toLocaleString()}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!bookings.length && !error && <p>No bookings for this event yet.</p>}
    </section>
  );
}

function Kpi({ title, value }) {
  return <article className="card kpi"><span>{title}</span><strong>{value ?? 0}</strong></article>;
}

function AdminDashboard() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [analytics, setAnalytics] = useState(null);
  const [users, setUsers] = useState([]);
  const [events, setEvents] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const params = { start_date: startDate || undefined, end_date: endDate || undefined };
    setLoading(true);
    setError('');
    Promise.all([
      api.get('/admin/analytics', { params }),
      api.get('/admin/users'),
      api.get('/admin/events'),
      api.get('/admin/bookings', { params }),
    ])
      .then(([analyticsResult, usersResult, eventsResult, bookingsResult]) => {
        setAnalytics(analyticsResult.data);
        setUsers(usersResult.data);
        setEvents(eventsResult.data);
        setBookings(bookingsResult.data);
      })
      .catch((err) => setError(errorMessage(err, 'Unable to load admin dashboard')))
      .finally(() => setLoading(false));
  }, [startDate, endDate]);

  const changeRole = async (userId, role) => {
    try {
      const { data } = await api.patch(`/admin/users/${userId}/role`, { role });
      setUsers((current) => current.map((user) => user.id === userId ? data : user));
    } catch (err) {
      setError(errorMessage(err, 'Unable to update user role'));
    }
  };

  return (
    <section>
      <div className="page-heading">
        <div><h1>Admin Dashboard</h1><p>Platform activity, access and performance.</p></div>
      </div>
      <div className="date-filter">
        <label>From <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} /></label>
        <label>To <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} /></label>
      </div>
      {error && <p className="error">{error}</p>}
      {loading && <p>Loading platform data...</p>}
      {analytics && (
        <>
          <div className="kpi-grid">
            <Kpi title="Registered users" value={analytics.total_users} />
            <Kpi title="Events" value={analytics.total_events} />
            <Kpi title="Tickets sold" value={analytics.total_tickets_sold} />
            <Kpi title="Bookings" value={analytics.total_bookings} />
            <Kpi title="Platform revenue" value={`₹${Number(analytics.platform_revenue).toLocaleString()}`} />
          </div>
          <div className="analytics-grid">
            <article className="card">
              <h2>Daily ticket sales</h2>
              <div className="bar-chart">
                {analytics.daily_ticket_sales.map((item) => {
                  const maximum = Math.max(...analytics.daily_ticket_sales.map((row) => row.tickets_sold), 1);
                  return <div className="bar-item" key={item.date} title={`${item.date}: ${item.tickets_sold} tickets`}>
                    <span style={{ height: `${Math.max(4, item.tickets_sold / maximum * 150)}px` }} />
                    <small>{item.date.slice(5)}</small>
                  </div>;
                })}
              </div>
            </article>
            <article className="card">
              <h2>Monthly booking trends</h2>
              <ul className="metric-list">{analytics.monthly_booking_trends.map((item) => (
                <li key={item.month}><span>{item.month}</span><strong>{item.bookings} bookings</strong></li>
              ))}</ul>
            </article>
          </div>
          <div className="analytics-grid">
            <article className="card">
              <h2>Most popular events</h2>
              <ul className="metric-list">{analytics.most_popular_events.map((item) => (
                <li key={item.event_id}><span>{item.event_title}</span><strong>{item.tickets_sold} tickets</strong></li>
              ))}</ul>
            </article>
            <article className="card">
              <h2>Top revenue events</h2>
              <ul className="metric-list">{analytics.top_revenue_events.map((item) => (
                <li key={item.event_id}><span>{item.event_title}</span><strong>₹{Number(item.revenue).toLocaleString()}</strong></li>
              ))}</ul>
            </article>
          </div>
        </>
      )}
      <h2>Users</h2>
      <div className="table-wrap">
        <table><thead><tr><th>User</th><th>Email</th><th>Joined</th><th>Role</th></tr></thead>
          <tbody>{users.map((user) => <tr key={user.id}>
            <td>{user.username}</td><td>{user.email}</td><td>{new Date(user.created_at).toLocaleDateString()}</td>
            <td><select value={user.role} onChange={(e) => changeRole(user.id, e.target.value)}>
              {['USER', 'ORGANIZER', 'ADMIN'].map((role) => <option key={role}>{role}</option>)}
            </select></td>
          </tr>)}</tbody>
        </table>
      </div>
      <h2>Events</h2>
      <div className="table-wrap">
        <table><thead><tr><th>Event</th><th>Organizer ID</th><th>Date</th><th>Status</th><th>Tickets left</th></tr></thead>
          <tbody>{events.map((event) => <tr key={event.id}>
            <td>{event.title}</td><td>{event.organizer_id ?? 'Legacy event'}</td>
            <td>{new Date(event.event_date).toLocaleString()}</td><td>{event.event_status}</td><td>{event.available_tickets}</td>
          </tr>)}</tbody>
        </table>
      </div>
      <h2>Bookings</h2>
      <div className="table-wrap">
        <table><thead><tr><th>Booking</th><th>Attendee</th><th>Event</th><th>Tickets</th><th>Total</th><th>Date</th></tr></thead>
          <tbody>{bookings.map((booking) => <tr key={booking.id}>
            <td>#{booking.id}</td><td>{booking.username}</td><td>{booking.event_title}</td>
            <td>{booking.ticket_quantity}</td><td>₹{booking.total_price}</td>
            <td>{new Date(booking.created_at).toLocaleString()}</td>
          </tr>)}</tbody>
        </table>
      </div>
    </section>
  );
}


// ==============================
// Main App
// ==============================

export default function App() {

  return (
    <>

      <WishlistProvider>
      <Navbar />

      <main className="container">

        <Routes>

          {/* Home */}

          <Route
            path="/"
            element={<Home />}
          />


          {/* Login */}

          <Route
            path="/login"
            element={<AuthPage mode="login" />}
          />


          {/* Register */}

          <Route
            path="/register"
            element={<AuthPage mode="register" />}
          />


          {/* Event Details */}

          <Route
            path="/events/:id"
            element={<EventDetails />}
          />

          <Route
            path="/checkout"
            element={<ProtectedRoute><Checkout /></ProtectedRoute>}
          />

          <Route
            path="/payment-confirmation/:id"
            element={<ProtectedRoute><BookingConfirmation /></ProtectedRoute>}
          />


          {/* Booking Confirmation */}

          <Route
            path="/booking-confirmation/:id"
            element={
              <ProtectedRoute>
                <BookingConfirmation />
              </ProtectedRoute>
            }
          />


          {/* Booking History */}

          <Route
            path="/bookings"
            element={
              <ProtectedRoute>
                <Bookings />
              </ProtectedRoute>
            }
          />


          {/* Tickets */}

          <Route
            path="/tickets"
            element={
              <ProtectedRoute>
                <Tickets />
              </ProtectedRoute>
            }
          />


          {/* Notifications */}

          <Route
            path="/notifications"
            element={
              <ProtectedRoute>
                <Notifications />
              </ProtectedRoute>
            }
          />

          <Route path="/wishlist" element={<ProtectedRoute><WishlistPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />

          <Route path="/organizer" element={<RoleRoute roles={['ORGANIZER']}><OrganizerDashboard /></RoleRoute>} />
          <Route path="/organizer/events" element={<RoleRoute roles={['ORGANIZER']}><OrganizerEvents /></RoleRoute>} />
          <Route path="/organizer/events/new" element={<RoleRoute roles={['ORGANIZER']}><OrganizerEventForm /></RoleRoute>} />
          <Route path="/organizer/events/:id/edit" element={<RoleRoute roles={['ORGANIZER']}><OrganizerEventForm editing /></RoleRoute>} />
          <Route path="/organizer/events/:id/bookings" element={<RoleRoute roles={['ORGANIZER']}><OrganizerEventBookings /></RoleRoute>} />
          <Route path="/admin" element={<RoleRoute roles={['ADMIN']}><AdminDashboard /></RoleRoute>} />

        </Routes>

      </main>

      <ChatAssistant />
      </WishlistProvider>
    </>
  );
}