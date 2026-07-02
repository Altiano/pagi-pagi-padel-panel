import { useEffect, useState } from 'react';
import { X } from 'lucide-react';
import { PLACEHOLDER_DURATION_OPTIONS } from '../constants.js';
import { apiRequest } from '../api/client.js';
import { buildReschedulePriceSummary, normalizeRescheduleSlots } from '../api/calendar.js';
import { formatUpstreamTime } from '../lib/datetime.js';
import {
  buildRescheduleBookingForm,
  getTimeRangeDurationMinutes,
  inferPlaceholderDurationMode,
  shiftFormEndTime,
} from './forms.js';
import { BookingActionSummary } from './BookingActionSummary.jsx';

export function RescheduleBookingDialog({ booking, canViewRevenue = true, courts, isSaving, mitraId, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildRescheduleBookingForm({ booking, courts, openHour }));
  const [error, setError] = useState('');
  const [slotState, setSlotState] = useState({ closed: false, error: '', items: [], loading: false });
  const [priceState, setPriceState] = useState({ data: null, error: '', loading: false });
  const durationMinutes = getTimeRangeDurationMinutes(form);
  const priceSummary = buildReschedulePriceSummary(priceState.data, canViewRevenue);

  useEffect(() => {
    if (!booking?.id || !mitraId || !form.date || !form.court_id) {
      setSlotState({ closed: false, error: '', items: [], loading: false });
      return undefined;
    }

    let active = true;
    setSlotState((current) => ({ ...current, error: '', loading: true }));
    apiRequest('/api/admin/reschedule-court-time-lists', {
      method: 'POST',
      body: JSON.stringify({
        mitra_id: mitraId,
        id: booking.id,
        date: form.date,
        court_id: form.court_id,
      }),
    })
      .then((response) => {
        if (!active) return;
        setSlotState({
          closed: Boolean(response?.closed),
          error: '',
          items: normalizeRescheduleSlots(response),
          loading: false,
        });
      })
      .catch((slotError) => {
        if (!active) return;
        setSlotState({ closed: false, error: slotError.message, items: [], loading: false });
      });

    return () => {
      active = false;
    };
  }, [booking?.id, form.court_id, form.date, mitraId]);

  useEffect(() => {
    if (!booking?.id || !mitraId || !form.date || !form.court_id || durationMinutes <= 0) {
      setPriceState({ data: null, error: '', loading: false });
      return undefined;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setPriceState((current) => ({ ...current, error: '', loading: true }));
      apiRequest('/api/admin/check-reschedule-court-price', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          date: form.date,
          court_id: form.court_id,
          start_hours: formatUpstreamTime(form.start_time),
          duration: durationMinutes,
        }),
      })
        .then((response) => {
          if (!active) return;
          setPriceState({ data: response, error: '', loading: false });
        })
        .catch((priceError) => {
          if (!active) return;
          setPriceState({ data: null, error: priceError.message, loading: false });
        });
    }, 180);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [booking?.id, durationMinutes, form.court_id, form.date, form.start_time, mitraId]);

  function updateField(field, value) {
    setForm((current) => {
      if (field === 'court_id') {
        return { ...current, court_id: value, court_name: courts.find((court) => court.id === value)?.name || '' };
      }
      if (field === 'start_time') {
        return { ...current, start_time: value, end_time: shiftFormEndTime(value, getTimeRangeDurationMinutes(current)) };
      }
      if (field === 'end_time') {
        return { ...current, end_time: value, duration_mode: inferPlaceholderDurationMode(current.start_time, value) };
      }
      return { ...current, [field]: value };
    });
  }

  function setDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftFormEndTime(current.start_time, minutes),
    }));
  }

  function selectSlot(time) {
    setForm((current) => ({
      ...current,
      start_time: time,
      end_time: shiftFormEndTime(time, getTimeRangeDurationMinutes(current)),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!form.court_id) {
      setError('Select a court.');
      return;
    }
    if (!form.date) {
      setError('Select a date.');
      return;
    }
    if (durationMinutes <= 0) {
      setError('End time must be after start time.');
      return;
    }
    if (slotState.closed) {
      setError('The selected date is closed.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to reschedule booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor conversion-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Reschedule</span>
          <button aria-label="Close reschedule panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Move booking</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />

            <label>
              Court
              <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                <option value="">Select court</option>
                {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
              </select>
            </label>

            <div className="form-grid time-grid">
              <label>
                Date
                <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
              </label>
              <label>
                Start time
                <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
              </label>
              <label>
                End time
                <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
              </label>
              <div className="duration-control">
                <span>Duration</span>
                <div className="duration-options">
                  {PLACEHOLDER_DURATION_OPTIONS.map((option) => (
                    <button
                      className={form.duration_mode === String(option.minutes) ? 'selected' : ''}
                      key={option.minutes}
                      onClick={() => setDuration(option.minutes)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    className={form.duration_mode === 'custom' ? 'selected' : ''}
                    onClick={() => updateField('duration_mode', 'custom')}
                    type="button"
                  >
                    Custom
                  </button>
                </div>
              </div>
            </div>

            <div className="reschedule-slot-list">
              <span>Available starts</span>
              {slotState.loading ? <p>Loading slots...</p> : null}
              {slotState.closed ? <p className="danger">Closed for selected date.</p> : null}
              {slotState.error ? <p className="danger">{slotState.error}</p> : null}
              {!slotState.loading && !slotState.closed && !slotState.error && !slotState.items.length ? <p>No slots returned.</p> : null}
              {slotState.items.length ? (
                <div>
                  {slotState.items.slice(0, 18).map((slot) => (
                    <button
                      className={form.start_time === slot.time ? 'selected' : ''}
                      key={slot.id}
                      onClick={() => selectSlot(slot.time)}
                      type="button"
                    >
                      {slot.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="price-check-card">
              <span>Price check</span>
              {priceState.loading ? <strong>Checking...</strong> : <strong>{priceSummary.heading}</strong>}
              {priceSummary.lines.map((line) => <small key={line}>{line}</small>)}
              {priceState.error ? <small className="danger">{priceState.error}</small> : null}
            </div>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || slotState.closed || durationMinutes <= 0} type="submit">
                {isSaving ? 'Saving...' : 'Reschedule'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
