import { useEffect, useState } from 'react';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Search,
  Upload,
  UserCheck,
  X,
} from 'lucide-react';
import { PLACEHOLDER_DURATION_OPTIONS, REGISTERED_PLAYER_SEARCH_MIN_LENGTH } from '../constants.js';
import { apiRequest } from '../api/client.js';
import { normalizePlayerSearchResults } from '../api/calendar.js';
import {
  buildMonthMatrix,
  formatDayNumber,
  formatLongDate,
  formatMonthLabel,
  parseTimeToMinutes,
  toDateInputValue,
} from '../lib/datetime.js';
import { formatMoneyInput, parseMoneyInput } from '../lib/format.js';
import {
  buildBookingWriteForm,
  getBookingFormDates,
  getSelectedCourtIds,
  getTimeRangeDurationMinutes,
  inferPlaceholderDurationMode,
  normalizeAdditionalBookingDates,
  shiftFormEndTime,
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
      ...(field === 'start_time' ? { end_time: shiftFormEndTime(value, getTimeRangeDurationMinutes(current)) } : null),
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
      if (next.size === 1) return;
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

  function setBookingWriteDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftFormEndTime(current.start_time, minutes),
    }));
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
}
