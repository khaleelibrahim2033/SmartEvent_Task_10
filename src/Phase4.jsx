import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import api from './api';

const WishlistContext = createContext({ ids: new Set(), toggle: async () => {} });

function getError(error, fallback) {
  const detail = error.response?.data?.detail;
  return typeof detail === 'string' ? detail : fallback;
}

export function WishlistProvider({ children }) {
  const token = localStorage.getItem('smartevent_token');
  useLocation();
  const [ids, setIds] = useState(new Set());

  useEffect(() => {
    if (!token) {
      setIds(new Set());
      return;
    }
    setIds(new Set());
    api.get('/wishlist').then((response) => {
      setIds(new Set(response.data.map((item) => item.event_id)));
    }).catch((error) => {
      console.error('Unable to load wishlist:', error);
    });
  }, [token]);

  const toggle = async (eventId) => {
    if (!localStorage.getItem('smartevent_token')) {
      throw new Error('Log in to save events to your wishlist.');
    }
    if (ids.has(eventId)) {
      await api.delete(`/wishlist/${eventId}`);
      setIds((current) => {
        const next = new Set(current);
        next.delete(eventId);
        return next;
      });
    } else {
      await api.post('/wishlist', { event_id: eventId });
      setIds((current) => new Set(current).add(eventId));
    }
  };

  const value = useMemo(() => ({ ids, toggle }), [ids]);
  return <WishlistContext.Provider value={value}>{children}</WishlistContext.Provider>;
}

export function WishlistButton({ eventId }) {
  const { ids, toggle } = useContext(WishlistContext);
  const [error, setError] = useState('');
  const saved = ids.has(eventId);

  const click = async (event) => {
    event.preventDefault();
    event.stopPropagation();
    setError('');
    try {
      await toggle(eventId);
    } catch (err) {
      setError(getError(err, 'Unable to update wishlist'));
    }
  };

  return (
    <span className="wishlist-control">
      <button type="button" className="wishlist-button" aria-label={saved ? 'Remove from wishlist' : 'Save to wishlist'}
        aria-pressed={saved} onClick={click}>{saved ? '♥ Saved' : '♡ Save'}</button>
      {error && <small className="wishlist-error">{error}</small>}
    </span>
  );
}

function EventTiles({ events, empty }) {
  if (!events.length) return <p>{empty}</p>;
  return (
    <div className="grid">
      {events.map((event) => (
        <article className="event-card" key={event.id}>
          <Link to={`/events/${event.id}`}>
            <img src={event.banner_image || ''} alt={event.title} />
            <div className="event-body">
              <span className="tag">{event.category}</span>
              <h2>{event.title}</h2>
              <p>📍 {event.location}</p>
              <p>📅 {new Date(event.event_date).toLocaleString()}</p>
              <strong>₹{event.ticket_price}</strong>
            </div>
          </Link>
          <div className="event-save"><WishlistButton eventId={event.id} /></div>
        </article>
      ))}
    </div>
  );
}

export function PersonalizedSections() {
  const location = useLocation();
  const authenticated = Boolean(localStorage.getItem('smartevent_token'));
  const [recommendations, setRecommendations] = useState([]);
  const [trending, setTrending] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    const requests = [api.get('/events/trending')];
    if (authenticated) requests.push(api.get('/events/recommendations'));
    Promise.allSettled(requests).then((results) => {
      if (!active) return;
      const [trendingResult, recommendedResult] = results;
      if (trendingResult.status === 'fulfilled') {
        setTrending(trendingResult.value.data);
      } else {
        setError(getError(trendingResult.reason, 'Unable to load trending events'));
      }
      if (recommendedResult?.status === 'fulfilled') {
        setRecommendations(recommendedResult.value.data);
      } else if (recommendedResult?.status === 'rejected') {
        setError(getError(recommendedResult.reason, 'Unable to load recommendations'));
      }
    });
    return () => { active = false; };
  }, [authenticated, location.pathname]);

  return (
    <section className="personalized-sections">
      {authenticated && (
        <section className="recommendation-block">
          <h2>Recommended for You</h2>
          <EventTiles events={recommendations} empty="Browse events and save your profile location to get personalized recommendations." />
        </section>
      )}
      <section className="recommendation-block">
        <h2>Trending Events</h2>
        <EventTiles events={trending} empty="No trending events are available right now." />
      </section>
      {error && <p className="error">{error}</p>}
    </section>
  );
}

export function LiveEventPanel({ eventId, availableTickets, onAvailabilityChange }) {
  const [live, setLive] = useState(false);

  useEffect(() => {
    const apiBase = (import.meta.env.VITE_API_URL || 'http://127.0.0.1:8000/api').replace(/\/+$/, '');
    const socket = new WebSocket(`${apiBase.replace(/^http/, 'ws')}/events/${eventId}/availability`);
    let fallback;
    socket.onopen = () => setLive(true);
    socket.onmessage = (message) => {
      const data = JSON.parse(message.data);
      onAvailabilityChange(data.available_tickets);
    };
    socket.onclose = () => {
      setLive(false);
      fallback = window.setInterval(() => {
        api.get(`/events/${eventId}`).then((response) => {
          onAvailabilityChange(response.data.available_tickets);
        }).catch((error) => console.error('Unable to refresh ticket availability:', error));
      }, 5000);
    };
    socket.onerror = () => socket.close();
    return () => {
      socket.close();
      if (fallback) window.clearInterval(fallback);
    };
  }, [eventId, onAvailabilityChange]);

  return (
    <p className="availability-line">
      <strong>{availableTickets}</strong> tickets available
      <span className={live ? 'live-indicator connected' : 'live-indicator'}>{live ? 'Live' : 'Updating'}</span>
    </p>
  );
}

export function EventUpdatesPanel({ eventId, eventOrganizerId }) {
  const [updates, setUpdates] = useState([]);
  const [message, setMessage] = useState('');
  const [important, setImportant] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  let user = {};
  try {
    user = JSON.parse(localStorage.getItem('smartevent_user') || '{}');
  } catch {
    user = {};
  }
  const canPost = user.role === 'ADMIN' || (user.role === 'ORGANIZER' && user.id === eventOrganizerId);

  const load = () => api.get(`/events/${eventId}/updates`).then((response) => {
    setUpdates(response.data);
    setError('');
  }).catch((err) => setError(getError(err, 'Unable to load event updates')));
  useEffect(() => {
    load();
    const timer = window.setInterval(load, 15000);
    return () => window.clearInterval(timer);
  }, [eventId]);

  const post = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      await api.post(`/events/${eventId}/updates`, { message, is_important: important });
      setMessage('');
      setImportant(false);
      await load();
    } catch (err) {
      setError(getError(err, 'Unable to post event update'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="card live-updates">
      <h2>Live Updates</h2>
      {updates.map((update) => (
        <article className={update.is_important ? 'event-update important' : 'event-update'} key={update.id}>
          <p>{update.is_important && <strong>Important · </strong>}{update.message}</p>
          <small>{new Date(update.created_at).toLocaleString()}</small>
        </article>
      ))}
      {!updates.length && !error && <p>No event announcements yet.</p>}
      {error && <p className="error">{error}</p>}
      {canPost && (
        <form className="update-form" onSubmit={post}>
          <label htmlFor="event-update-message">Post an announcement</label>
          <textarea id="event-update-message" maxLength="2000" required value={message}
            onChange={(event) => setMessage(event.target.value)} />
          <label><input type="checkbox" checked={important} onChange={(event) => setImportant(event.target.checked)} /> Mark as important</label>
          <button disabled={saving || !message.trim()}>{saving ? 'Posting...' : 'Post update'}</button>
        </form>
      )}
    </section>
  );
}

export function WishlistPage() {
  const { ids } = useContext(WishlistContext);
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');
  const load = () => api.get('/wishlist').then((response) => setItems(response.data))
    .catch((err) => setError(getError(err, 'Unable to load wishlist')));
  useEffect(() => { load(); }, []);

  return (
    <>
      <h1>My Wishlist</h1>
      {error && <p className="error">{error}</p>}
      {!items.length && !error && <p>Save events to find them here later.</p>}
      <div className="grid">
        {items.filter((item) => ids.has(item.event_id)).map((item) => (
          <article className="event-card" key={item.id}>
            <Link to={`/events/${item.event.id}`}>
              <img src={item.event.banner_image || ''} alt={item.event.title} />
              <div className="event-body"><span className="tag">{item.event.category}</span><h2>{item.event.title}</h2>
                <p>📍 {item.event.location}</p><p>📅 {new Date(item.event.event_date).toLocaleString()}</p>
                <strong>₹{item.event.ticket_price}</strong>
              </div>
            </Link>
            <div className="event-save"><WishlistButton eventId={item.event_id} /></div>
            <div className="event-save"><Link className="button secondary" to={`/events/${item.event.id}`}>Book this event</Link></div>
          </article>
        ))}
      </div>
    </>
  );
}

export function ProfilePage() {
  const [profile, setProfile] = useState({ username: '', email: '', location: '', profile_image_url: '' });
  const [activity, setActivity] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    Promise.all([api.get('/users/me'), api.get('/users/me/activity')]).then(([user, summary]) => {
      setProfile({
        username: user.data.username,
        email: user.data.email,
        location: user.data.location || '',
        profile_image_url: user.data.profile_image_url || '',
      });
      setActivity(summary.data);
    }).catch((err) => setError(getError(err, 'Unable to load profile')));
  }, []);

  const save = async (event) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const response = await api.patch('/users/me', {
        ...profile,
        profile_image_url: profile.profile_image_url || null,
      });
      localStorage.setItem('smartevent_user', JSON.stringify(response.data));
      setProfile({
        username: response.data.username,
        email: response.data.email,
        location: response.data.location || '',
        profile_image_url: response.data.profile_image_url || '',
      });
      setNotice('Profile updated.');
    } catch (err) {
      setError(getError(err, 'Unable to update profile'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <h1>My Profile</h1>
      {error && <p className="error">{error}</p>}
      {notice && <p className="success-message">{notice}</p>}
      <form className="card profile-form" onSubmit={save}>
        {profile.profile_image_url && <img className="profile-image" src={profile.profile_image_url} alt="Profile" />}
        <label>Username<input required minLength="3" maxLength="80" value={profile.username} onChange={(event) => setProfile({ ...profile, username: event.target.value })} /></label>
        <label>Email<input type="email" required value={profile.email} onChange={(event) => setProfile({ ...profile, email: event.target.value })} /></label>
        <label>Location<input maxLength="200" placeholder="City or region" value={profile.location} onChange={(event) => setProfile({ ...profile, location: event.target.value })} /></label>
        <label>Profile picture URL (optional)<input type="url" maxLength="500" value={profile.profile_image_url} onChange={(event) => setProfile({ ...profile, profile_image_url: event.target.value })} /></label>
        <button disabled={saving}>{saving ? 'Saving...' : 'Save profile'}</button>
      </form>
      {activity && (
        <section className="card">
          <h2>Your activity</h2>
          <div className="kpi-grid">
            <div className="card kpi"><span>Bookings</span><strong>{activity.booking_count}</strong></div>
            <div className="card kpi"><span>Confirmed bookings</span><strong>{activity.confirmed_bookings}</strong></div>
            <div className="card kpi"><span>Tickets booked</span><strong>{activity.tickets_booked}</strong></div>
            <div className="card kpi"><span>Saved events</span><strong>{activity.wishlist_count}</strong></div>
          </div>
          <h3>Recent bookings</h3>
          {activity.recent_bookings.map((booking) => <p key={booking.id}>
            <Link to="/bookings">Booking #{booking.id}</Link> · {booking.status} · {booking.tickets} ticket(s)
          </p>)}
        </section>
      )}
    </>
  );
}

export function ChatAssistant() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [messages, setMessages] = useState([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const send = async (text = input) => {
    const content = text.trim();
    if (!content || loading) return;
    if (!localStorage.getItem('smartevent_token')) {
      navigate('/login');
      return;
    }
    const history = messages.slice(-10).map(({ role, content: body }) => ({ role, content: body }));
    setMessages((current) => [...current, { role: 'user', content }]);
    setInput('');
    setError('');
    setLoading(true);
    try {
      const response = await api.post('/assistant/chat', { message: content, history });
      setMessages((current) => [...current, { role: 'assistant', content: response.data.response }]);
    } catch (err) {
      setError(getError(err, 'Unable to reach the assistant'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <aside className="chat-widget">
      {open && (
        <section className="chat-panel" aria-label="SmartEvent assistant">
          <header><strong>SmartEvent Assistant</strong><button type="button" className="chat-close" onClick={() => setOpen(false)}>×</button></header>
          {!messages.length && <div className="chat-suggestions">
            {['Trending events', 'Show my bookings', 'Help with ticket issues'].map((suggestion) => (
              <button type="button" className="secondary" key={suggestion} onClick={() => send(suggestion)}>{suggestion}</button>
            ))}
          </div>}
          <div className="chat-messages" aria-live="polite">
            {messages.map((message, index) => <p className={`chat-message ${message.role}`} key={`${index}-${message.role}`}>{message.content}</p>)}
            {loading && <p className="chat-message assistant">Thinking…</p>}
          </div>
          {error && <p className="error">{error}</p>}
          <form className="chat-compose" onSubmit={(event) => { event.preventDefault(); send(); }}>
            <input aria-label="Message the assistant" placeholder="Ask about events or bookings" value={input} onChange={(event) => setInput(event.target.value)} />
            <button disabled={loading || !input.trim()}>Send</button>
          </form>
        </section>
      )}
      <button className="chat-launcher" type="button" aria-expanded={open} onClick={() => setOpen(!open)}>💬 Help</button>
    </aside>
  );
}
