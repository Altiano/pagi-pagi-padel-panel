// Modal dialogs for real-booking writes: create/convert, payment proof,
// reschedule, cancel, notes, the placeholder-vs-real slot chooser, and the
// shared booking summary header.
import { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CalendarCheck,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Search,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { PLACEHOLDER_DURATION_OPTIONS, RECEIPT_ATTACHMENT_TYPE, REGISTERED_PLAYER_SEARCH_MIN_LENGTH } from '../constants.js';
import { apiRequest } from '../api/client.js';
import { buildReschedulePriceSummary, normalizePlayerSearchResults, normalizeRescheduleSlots } from '../api/calendar.js';
import {
  buildMonthMatrix,
  formatDayNumber,
  formatLongDate,
  formatMonthLabel,
  formatUpstreamTime,
  parseTimeToMinutes,
  shiftTime,
  toDateInputValue,
} from '../lib/datetime.js';
import { formatMoneyInput, parseMoneyInput } from '../lib/format.js';
import { getStartLabel } from '../lib/bookings.js';
import {
  buildBookingWriteForm,
  buildRescheduleBookingForm,
  getBookingFormDates,
  getSelectedCourtIds,
  getTimeRangeDurationMinutes,
  inferPlaceholderDurationMode,
  normalizeAdditionalBookingDates,
} from './forms.js';

export function BookingWriteDialog({ actionMode, booking, canViewRevenue = true, conflicts, courts, defaultDate, draft, isSaving, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildBookingWriteForm({ booking, courts, defaultDate, draft, openHour }));
  const [error, setError] = useState('');
  const [calendarMonth, setCalendarMonth] = useState(() => form.date || defaultDate || toDateInputValue(new Date()));
  const [multiDate, setMultiDate] = useState(() => (form.additional_dates?.length || 0) > 0);
  const [playerState, setPlayerState] = useState({ error: '', loading: false, results: [] });
  const isRegistered = form.customerMode === 'registered';
  const searchQuery = form.playerSearch.trim();
  const isConversion = actionMode === 'convert-placeholder';
  const bookingDates = isConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);
  const selectedDateSet = new Set(bookingDates);
  const selectedCourtIds = isConversion ? [form.court_id].filter(Boolean) : getSelectedCourtIds(form);
  const selectedCourtNames = selectedCourtIds
    .map((courtId) => courts.find((court) => court.id === courtId)?.name || courtId)
    .filter(Boolean);
  const bookingTargetCount = bookingDates.length * selectedCourtIds.length;
  const monthCells = buildMonthMatrix(calendarMonth);
  const todayValue = toDateInputValue(new Date());
  const conflictList = conflicts(form, booking);
  const hasConflict = conflictList.length > 0;
  const title = isConversion ? 'Create real booking' : bookingTargetCount > 1 ? 'Create bookings' : 'Create booking';
  const panelLabel = isConversion ? 'Convert placeholder' : 'New real booking';

  useEffect(() => {
    if (!isRegistered || form.selectedPlayer || searchQuery.length < REGISTERED_PLAYER_SEARCH_MIN_LENGTH) {
      setPlayerState({ error: '', loading: false, results: [] });
      return undefined;
    }

    let active = true;
    const timeout = window.setTimeout(() => {
      setPlayerState((current) => ({ ...current, error: '', loading: true }));
      apiRequest(`/api/admin/player/search-player-lists?per_page=100&search=${encodeURIComponent(searchQuery)}`)
        .then((response) => {
          if (!active) return;
          setPlayerState({ error: '', loading: false, results: normalizePlayerSearchResults(response) });
        })
        .catch((searchError) => {
          if (!active) return;
          setPlayerState({ error: searchError.message, loading: false, results: [] });
        });
    }, 260);

    return () => {
      active = false;
      window.clearTimeout(timeout);
    };
  }, [form.selectedPlayer, isRegistered, searchQuery]);

  function updateField(field, value) {
    setForm((current) => ({
      ...current,
      [field]: value,
      ...(field === 'court_id' ? { court_ids: value ? [value] : [], court_name: courts.find((court) => court.id === value)?.name || '' } : null),
      ...(field === 'date' ? { additional_dates: normalizeAdditionalBookingDates(current.additional_dates, value) } : null),
      ...(field === 'start_time' ? { end_time: shiftTime(value, getTimeRangeDurationMinutes(current)) } : null),
      ...(field === 'end_time' ? { duration_mode: inferPlaceholderDurationMode(current.start_time, value) } : null),
      ...(field === 'playerSearch' ? { selectedPlayer: null } : null),
      ...(field === 'customerMode' && value === 'offline' ? { selectedPlayer: null } : null),
    }));
  }

  function toggleCourt(courtId) {
    if (isConversion) return;
    setForm((current) => {
      const courtIds = new Set(getSelectedCourtIds(current));
      if (courtIds.has(courtId)) {
        courtIds.delete(courtId);
      } else {
        courtIds.add(courtId);
      }
      const nextCourtIds = [...courtIds];
      const firstCourt = courts.find((court) => court.id === nextCourtIds[0]);
      return {
        ...current,
        court_id: nextCourtIds[0] || '',
        court_ids: nextCourtIds,
        court_name: firstCourt?.name || '',
      };
    });
  }

  function selectPlayer(player) {
    setForm((current) => ({
      ...current,
      playerSearch: player.name || '',
      selectedPlayer: player,
    }));
  }

  function applyBookingDates(dates) {
    const sorted = [...new Set(dates.map((date) => String(date || '').trim()).filter(Boolean))].sort();
    if (!sorted.length) return;
    const [anchor, ...rest] = sorted;
    setForm((current) => ({ ...current, date: anchor, additional_dates: rest }));
  }

  function toggleBookingDate(dateValue) {
    if (!dateValue) return;
    if (isConversion) {
      updateField('date', dateValue);
      return;
    }
    const next = new Set(getBookingFormDates(form));
    if (next.has(dateValue)) {
      if (next.size === 1) return; // keep at least one date
      next.delete(dateValue);
    } else {
      next.add(dateValue);
    }
    applyBookingDates([...next]);
  }

  function shiftCalendarMonth(delta) {
    const base = new Date(`${calendarMonth}T00:00:00`);
    setCalendarMonth(toDateInputValue(new Date(base.getFullYear(), base.getMonth() + delta, 1)));
  }

  function enableMultiDate() {
    setCalendarMonth(form.date || calendarMonth);
    setMultiDate(true);
  }

  function collapseToSingleDate() {
    setForm((current) => ({ ...current, additional_dates: [] }));
    setMultiDate(false);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    const selectedDates = isConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);

    if (!selectedCourtIds.length) {
      setError('Select at least one court.');
      return;
    }
    if (!selectedDates.length) {
      setError('Select at least one date.');
      return;
    }
    if (parseTimeToMinutes(form.end_time) <= parseTimeToMinutes(form.start_time)) {
      setError('End time must be after start time.');
      return;
    }
    if (hasConflict) {
      setError('This booking overlaps with another booking on the selected court.');
      return;
    }
    if (isRegistered && !form.selectedPlayer?.id) {
      setError('Select a registered player first.');
      return;
    }
    if (!isRegistered && !form.offlineUser.trim()) {
      setError('Enter the offline customer name.');
      return;
    }
    if (Number.isNaN(Number(form.price || 0)) || Number(form.price || 0) < 0) {
      setError('Booking price must be zero or greater.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (convertError) {
      setError(convertError.message || 'Unable to save booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor conversion-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">{panelLabel}</span>
          <button aria-label="Close booking panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>{title}</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            {hasConflict ? (
              <div className="detail-conflict-alert">
                <strong>Booking conflict</strong>
                <span>Overlaps with {conflictList.slice(0, 2).map((item) => `${item.booking_owner || item.name}${item.conflict_date ? ` on ${formatDayNumber(item.conflict_date)}` : ''}`).join(', ')}.</span>
              </div>
            ) : null}

            {isConversion ? (
              <label>
                Court
                <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                  <option value="">Select court</option>
                  {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="court-picker">
                <span>Courts</span>
                <div className="court-choice-grid">
                  {courts.map((court) => (
                    <label className={`court-choice ${selectedCourtIds.includes(court.id) ? 'selected' : ''}`} key={court.id}>
                      <input
                        checked={selectedCourtIds.includes(court.id)}
                        onChange={() => toggleCourt(court.id)}
                        type="checkbox"
                      />
                      {court.name}
                    </label>
                  ))}
                </div>
                {selectedCourtNames.length > 1 ? (
                  <small>{selectedCourtNames.length} courts selected: {selectedCourtNames.join(', ')}</small>
                ) : null}
              </div>
            )}

            {isConversion || !multiDate ? (
              <div className="booking-date-single">
                <label>
                  Date
                  <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
                </label>
                {isConversion ? null : (
                  <button className="booking-date-advanced-toggle" onClick={enableMultiDate} type="button">
                    <CalendarDays size={15} />
                    Book on multiple dates
                  </button>
                )}
              </div>
            ) : (
            <div className="booking-calendar">
              <div className="booking-calendar-heading">
                <span>Booking dates</span>
                <strong>{bookingDates.length} {bookingDates.length === 1 ? 'day' : 'days'}</strong>
              </div>
              <p className="booking-calendar-hint">Tap days to book the selected courts at this time.</p>
              <div className="booking-calendar-nav">
                <button aria-label="Previous month" onClick={() => shiftCalendarMonth(-1)} type="button">
                  <ChevronLeft size={16} />
                </button>
                <strong>{formatMonthLabel(calendarMonth)}</strong>
                <button aria-label="Next month" onClick={() => shiftCalendarMonth(1)} type="button">
                  <ChevronRight size={16} />
                </button>
              </div>
              <div className="booking-calendar-grid">
                {['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map((day) => (
                  <span className="booking-calendar-dow" key={day}>{day}</span>
                ))}
                {monthCells.map((cell) => {
                  const isSelected = selectedDateSet.has(cell.value);
                  const classes = [
                    'booking-calendar-day',
                    cell.inMonth ? '' : 'muted',
                    isSelected ? 'selected' : '',
                    cell.value === todayValue ? 'today' : '',
                  ].filter(Boolean).join(' ');
                  return (
                    <button
                      aria-label={`${isSelected ? 'Remove' : 'Add'} ${formatLongDate(cell.value)}`}
                      aria-pressed={isSelected}
                      className={classes}
                      key={cell.value}
                      onClick={() => toggleBookingDate(cell.value)}
                      type="button"
                    >
                      {Number(cell.value.slice(8, 10))}
                    </button>
                  );
                })}
              </div>
              {bookingDates.length > 1 ? (
                <div className="booking-calendar-chips">
                  {bookingDates.map((date) => (
                    <span key={date}>
                      {formatDayNumber(date)}
                      <button aria-label={`Remove ${formatLongDate(date)}`} onClick={() => toggleBookingDate(date)} type="button">
                        <X size={13} />
                      </button>
                    </span>
                  ))}
                </div>
              ) : null}
              <button className="booking-calendar-collapse" onClick={collapseToSingleDate} type="button">
                Use a single date
              </button>
            </div>
            )}

            <div className="form-grid time-grid">
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
                      onClick={() => setBookingWriteDuration(option.minutes)}
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

            <div className="conversion-mode-control">
              <span>Customer</span>
              <div>
                <button
                  className={form.customerMode === 'offline' ? 'selected' : ''}
                  onClick={() => updateField('customerMode', 'offline')}
                  type="button"
                >
                  Offline
                </button>
                <button
                  className={form.customerMode === 'registered' ? 'selected' : ''}
                  onClick={() => updateField('customerMode', 'registered')}
                  type="button"
                >
                  Registered
                </button>
              </div>
            </div>

            {isRegistered ? (
              <div className="registered-player-field">
                <label>
                  Search player
                  <span className="search-input-wrap">
                    <Search size={15} />
                    <input
                      onChange={(event) => updateField('playerSearch', event.target.value)}
                      placeholder="Type customer name"
                      value={form.playerSearch}
                    />
                  </span>
                </label>
                {form.selectedPlayer ? (
                  <div className="selected-player">
                    <UserCheck size={16} />
                    <span>
                      <strong>{form.selectedPlayer.name}</strong>
                      <small>{form.selectedPlayer.mobile || form.selectedPlayer.email || 'Registered player'}</small>
                    </span>
                    <button onClick={() => updateField('playerSearch', form.selectedPlayer.name || '')} type="button">Change</button>
                  </div>
                ) : (
                  <div className="player-results">
                    {playerState.loading ? <span>Searching...</span> : null}
                    {playerState.error ? <span className="error">{playerState.error}</span> : null}
                    {!playerState.loading && !playerState.error && searchQuery.length >= REGISTERED_PLAYER_SEARCH_MIN_LENGTH && !playerState.results.length ? (
                      <span>No players found.</span>
                    ) : null}
                    {playerState.results.slice(0, 6).map((player) => (
                      <button key={player.id} onClick={() => selectPlayer(player)} type="button">
                        <strong>{player.name}</strong>
                        <small>{player.mobile || player.email || 'Registered player'}</small>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <label>
                Offline customer name
                <input
                  onChange={(event) => updateField('offlineUser', event.target.value)}
                  placeholder="Customer or group name"
                  required
                  value={form.offlineUser}
                />
              </label>
            )}

            <div className="form-grid two">
              {canViewRevenue ? (
                <label>
                  Booking price
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateField('price', parseMoneyInput(event.target.value))}
                    placeholder="Rp 0"
                    value={formatMoneyInput(form.price)}
                  />
                </label>
              ) : null}
              <label>
                Payment
                <input readOnly value="Paid offline" />
              </label>
            </div>

            <label>
              Transfer receipt
              <span className="receipt-upload-control">
                <Upload size={16} />
                <span>{form.receiptFile?.name || 'No file selected'}</span>
                <input
                  accept="image/*"
                  onChange={(event) => updateField('receiptFile', event.target.files?.[0] || null)}
                  type="file"
                />
              </span>
            </label>

            <label>
              Notes
              <textarea onChange={(event) => updateField('notes', event.target.value)} rows={4} value={form.notes} />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || hasConflict} type="submit">
                {isSaving ? 'Saving...' : title}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );

  function setBookingWriteDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftTime(current.start_time, minutes),
    }));
  }
}

export function PaymentProofDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ attachmentType: RECEIPT_ATTACHMENT_TYPE, receiptFile: null }));
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!booking?.trans_id) {
      setError('This booking does not have a transaction ID for attachment upload.');
      return;
    }
    if (!form.receiptFile) {
      setError('Select a transfer receipt first.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to upload receipt.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Payment proof</span>
          <button aria-label="Close payment proof panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Upload receipt</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Attachment type
              <input onChange={(event) => updateField('attachmentType', event.target.value)} required value={form.attachmentType} />
            </label>
            <label>
              Transfer receipt
              <span className="receipt-upload-control">
                <Upload size={16} />
                <span>{form.receiptFile?.name || 'No file selected'}</span>
                <input
                  accept="image/*,.pdf"
                  onChange={(event) => updateField('receiptFile', event.target.files?.[0] || null)}
                  required
                  type="file"
                />
              </span>
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || !form.receiptFile} type="submit">
                {isSaving ? 'Uploading...' : 'Upload receipt'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

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
        return { ...current, start_time: value, end_time: shiftTime(value, getTimeRangeDurationMinutes(current)) };
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
      end_time: shiftTime(current.start_time, minutes),
    }));
  }

  function selectSlot(time) {
    setForm((current) => ({
      ...current,
      start_time: time,
      end_time: shiftTime(time, getTimeRangeDurationMinutes(current)),
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

export function SlotChoiceDialog({ draft, onChoosePlaceholder, onChooseRealBooking, onClose }) {
  const courtName = draft?.court_name;
  const slotLabel = draft?.start_time && draft?.end_time
    ? `${draft.start_time}–${draft.end_time}`
    : draft?.start_time || '';
  const dateLabel = draft?.date ? formatLongDate(draft.date) : '';

  return (
    <div className="slot-choice-backdrop" onClick={onClose}>
      <aside className="slot-choice-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">New booking</span>
          <button aria-label="Close booking type panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>What would you like to add?</h2>
        {(courtName || slotLabel || dateLabel) ? (
          <p className="slot-choice-context">
            {[courtName, dateLabel, slotLabel].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        <div className="slot-choice-options">
          <button className="slot-choice-option" onClick={onChoosePlaceholder} type="button">
            <ClipboardList size={20} />
            <span>
              <strong>Placeholder booking</strong>
              <small>Hold the slot without confirmed payment details.</small>
            </span>
          </button>
          <button className="slot-choice-option primary" onClick={onChooseRealBooking} type="button">
            <CalendarCheck size={20} />
            <span>
              <strong>Real booking</strong>
              <small>Create a confirmed booking on the schedule.</small>
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}

export function CancelBookingDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ cancel_note: 'Cancel' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to cancel booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Cancel booking</span>
          <button aria-label="Close cancel booking panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Cancel booking</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <div className="conversion-warning danger">
              <AlertTriangle size={16} />
              <span>This booking will be removed from the upstream schedule.</span>
            </div>
            <label>
              Cancel note
              <textarea
                onChange={(event) => setForm({ cancel_note: event.target.value })}
                rows={4}
                value={form.cancel_note}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Keep booking</button>
              <button className="primary-button danger-button" disabled={isSaving} type="submit">
                {isSaving ? 'Canceling...' : 'Cancel booking'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function BookingNotesDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ notes: booking?.notes || '' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save notes.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Booking notes</span>
          <button aria-label="Close notes panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Edit notes</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Notes
              <textarea
                onChange={(event) => setForm({ notes: event.target.value })}
                rows={6}
                value={form.notes}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

export function BookingActionSummary({ booking }) {
  return (
    <div className="conversion-summary">
      <span>{booking?.court_name || booking?.court_id || 'Court'}</span>
      <strong>{booking?.booking_owner || booking?.name || 'Booking'} · {booking?.time || getStartLabel(booking)}</strong>
      <small>{booking?.date ? `${formatLongDate(booking.date)} · ` : ''}{booking?.trans_id || booking?.id || '-'}</small>
    </div>
  );
}


