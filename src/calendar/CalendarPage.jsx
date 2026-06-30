// Calendar feature controller: owns view/date/selection/editor state, loads
// data via the cache, runs booking + placeholder write actions, and wires the
// grid views, detail panel, and write dialogs together.
import { useEffect, useRef, useState } from 'react';
import {
  CalendarCheck,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Clock,
  LogOut,
  Plus,
  RefreshCw,
  X,
} from 'lucide-react';
import { apiRequest } from '../api/client.js';
import { fetchBookingDetailForAction, hasCalendarDataCache, loadCalendarData, uploadBookingReceipt } from '../api/calendar.js';
import { useEscapeKey } from '../hooks.js';
import {
  formatAvailabilityRange,
  formatLongDate,
  formatUpstreamTime,
  getWeekDays,
  isTodayDate,
  parseTimeToMinutes,
  scrollDayCalendarToCurrentTime,
  shiftDate,
  toDateInputValue,
} from '../lib/datetime.js';
import {
  bookingsOverlap,
  getCourtBookingWriteType,
  normalizePlaceholderBooking,
  summarizeDay,
  summarizeWeek,
} from '../lib/bookings.js';
import {
  buildCancelBookingPayload,
  buildCourtBookingPayload,
  getBookingFormDates,
  getSelectedCourtIds,
  getTimeRangeDurationMinutes,
} from './forms.js';
import { DayCalendar, MobileDayAgenda, MobileWeekCalendar, WeekCalendar } from './CalendarViews.jsx';
import { CalendarDetailPanel } from './CalendarDetailPanel.jsx';
import {
  BookingNotesDialog,
  BookingWriteDialog,
  CancelBookingDialog,
  PaymentProofDialog,
  RescheduleBookingDialog,
  SlotChoiceDialog,
} from './BookingDialogs.jsx';
import { PlaceholderBookingEditor } from './PlaceholderBookingEditor.jsx';

export function CalendarPage({ cacheScope = 'session', canViewRevenue = true, canWriteBookings = true, displayName, isMobileApp = false, isVirtualUser = false, mitraId, onLogout, onUseMobileView }) {
  const [view, setView] = useState(() => (isMobileApp ? 'day' : 'week'));
  const [selectedDate, setSelectedDate] = useState(() => toDateInputValue(new Date()));
  const [refreshKey, setRefreshKey] = useState(0);
  const [state, setState] = useState({ loading: true, error: '', courts: [], openHour: null, bookingsByDate: {} });
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [placeholderEditor, setPlaceholderEditor] = useState({ mode: 'closed', booking: null });
  const [bookingActionEditor, setBookingActionEditor] = useState({ mode: 'closed', booking: null, draft: null });
  const [slotChoice, setSlotChoice] = useState({ open: false, draft: null });
  const [placeholderStatus, setPlaceholderStatus] = useState({ state: 'idle', message: '' });
  const [hiddenAboveCount, setHiddenAboveCount] = useState(0);
  const [hiddenBelowCount, setHiddenBelowCount] = useState(0);
  const [showSummaryPanel, setShowSummaryPanel] = useState(false);
  const calendarPanelRef = useRef(null);
  const lastRefreshKeyRef = useRef(refreshKey);
  const lastSelectionScopeRef = useRef({ cacheScope, mitraId, selectedDate });
  const autoDayScrollKeyRef = useRef('');

  const weekDays = getWeekDays(selectedDate);
  const activeBookings = state.bookingsByDate[selectedDate] || [];
  const selectedDaySummary = summarizeDay(activeBookings, state.openHour, state.courts.length, canViewRevenue);
  const weekSummary = summarizeWeek(weekDays, state.bookingsByDate, state.openHour, state.courts.length, canViewRevenue);
  const showDetailPanel = !isMobileApp && (selectedBooking || showSummaryPanel);
  const isPlaceholderEditorOpen = placeholderEditor.mode !== 'closed';
  const isBookingActionEditorOpen = bookingActionEditor.mode !== 'closed';
  const isSlotChoiceOpen = slotChoice.open;
  const showCalendarFeedback = Boolean(state.error || (placeholderStatus.message && !isPlaceholderEditorOpen && !isBookingActionEditorOpen));

  useEffect(() => {
    if (isMobileApp) setView('day');
  }, [isMobileApp]);

  function closePlaceholderEditor() {
    setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeBookingActionEditor() {
    setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeSlotChoice() {
    setSlotChoice({ open: false, draft: null });
  }

  function closeCalendarDetail() {
    setSelectedBooking(null);
    setShowSummaryPanel(false);
  }

  useEscapeKey(() => {
    if (isSlotChoiceOpen) {
      closeSlotChoice();
      return;
    }
    if (isBookingActionEditorOpen) {
      closeBookingActionEditor();
      return;
    }
    if (isPlaceholderEditorOpen) {
      closePlaceholderEditor();
      return;
    }
    closeCalendarDetail();
  }, isSlotChoiceOpen || isBookingActionEditorOpen || isPlaceholderEditorOpen || Boolean(selectedBooking) || showSummaryPanel);

  useEffect(() => {
    let active = true;
    const forceRefresh = refreshKey !== lastRefreshKeyRef.current;
    const selectionScopeChanged = lastSelectionScopeRef.current.cacheScope !== cacheScope
      || lastSelectionScopeRef.current.mitraId !== mitraId
      || lastSelectionScopeRef.current.selectedDate !== selectedDate;
    const hasFreshCachedData = !forceRefresh && hasCalendarDataCache({ cacheScope, mitraId, selectedDate, weekDays });

    lastRefreshKeyRef.current = refreshKey;
    lastSelectionScopeRef.current = { cacheScope, mitraId, selectedDate };

    setState((current) => ({ ...current, loading: !hasFreshCachedData, error: '' }));
    if (selectionScopeChanged) setSelectedBooking(null);

    loadCalendarData({ cacheScope, forceRefresh, mitraId, selectedDate, weekDays })
      .then((data) => {
        if (active) setState({ loading: false, error: '', ...data });
      })
      .catch((error) => {
        if (active) setState((current) => ({ ...current, loading: false, error: error.message }));
      });

    return () => {
      active = false;
    };
  }, [cacheScope, mitraId, selectedDate, refreshKey]);

  useEffect(() => {
    if (view !== 'day' || state.loading || !isTodayDate(selectedDate)) {
      autoDayScrollKeyRef.current = '';
      return undefined;
    }

    if (autoDayScrollKeyRef.current === selectedDate) return undefined;
    autoDayScrollKeyRef.current = selectedDate;

    const frame = window.requestAnimationFrame(() => {
      scrollDayCalendarToCurrentTime(calendarPanelRef.current, state.openHour);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [selectedDate, state.loading, state.openHour, view]);

  useEffect(() => {
    const panel = calendarPanelRef.current;
    if (!panel || view !== 'day' || state.loading) {
      setHiddenAboveCount(0);
      setHiddenBelowCount(0);
      return undefined;
    }

    const updateHiddenBookings = () => {
      const panelRect = panel.getBoundingClientRect();
      const headerRect = panel.querySelector('.day-calendar-header')?.getBoundingClientRect();
      const visibleTop = Math.max(panelRect.top, headerRect?.bottom || panelRect.top);
      const visibleBottom = panelRect.bottom - 24;
      const blocks = Array.from(panel.querySelectorAll('.booking-block'));
      const above = blocks.filter((block) => block.getBoundingClientRect().bottom < visibleTop + 8);
      const below = blocks.filter((block) => block.getBoundingClientRect().top > visibleBottom);
      setHiddenAboveCount(above.length);
      setHiddenBelowCount(below.length);
    };

    updateHiddenBookings();
    panel.addEventListener('scroll', updateHiddenBookings, { passive: true });
    window.addEventListener('resize', updateHiddenBookings);

    return () => {
      panel.removeEventListener('scroll', updateHiddenBookings);
      window.removeEventListener('resize', updateHiddenBookings);
    };
  }, [view, state.loading, activeBookings]);

  function moveDate(days) {
    setSelectedDate((current) => shiftDate(current, days));
  }

  function moveWeek(weeks) {
    setSelectedDate((current) => shiftDate(current, weeks * 7));
  }

  function openCreatePlaceholder(draft = null) {
    setPlaceholderStatus({ state: 'idle', message: '' });
    setPlaceholderEditor({ mode: 'create', booking: null, draft });
  }

  function openSlotChoice(draft = null) {
    // Operators without booking-write access can only make placeholders, so skip the prompt.
    if (!canWriteBookings) {
      openCreatePlaceholder(draft);
      return;
    }
    setSlotChoice({ open: true, draft });
  }

  function chooseSlotPlaceholder() {
    const { draft } = slotChoice;
    closeSlotChoice();
    openCreatePlaceholder(draft);
  }

  function chooseSlotRealBooking() {
    const { draft } = slotChoice;
    closeSlotChoice();
    openCreateRealBooking(draft);
  }

  function openEditPlaceholder(booking) {
    setPlaceholderStatus({ state: 'idle', message: '' });
    setPlaceholderEditor({ mode: 'edit', booking });
  }

  function requireBookingWriteAccess() {
    if (canWriteBookings) return true;
    setPlaceholderStatus({
      state: 'error',
      message: 'This virtual user needs Calendar booking permission to write real bookings.',
    });
    return false;
  }

  function openCreateRealBooking(draft = null) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'create-booking', booking: null, draft });
  }

  function openConvertPlaceholder(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'convert-placeholder', booking, draft: null });
  }

  function openPaymentProof(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'payment-proof', booking, draft: null });
  }

  function openRescheduleBooking(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'reschedule', booking, draft: null });
  }

  function openCancelBooking(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'cancel', booking, draft: null });
  }

  function openBookingNotes(booking) {
    if (!requireBookingWriteAccess()) return;
    setPlaceholderStatus({ state: 'idle', message: '' });
    setBookingActionEditor({ mode: 'notes', booking, draft: null });
  }

  function requestCalendarRefresh() {
    setRefreshKey((current) => current + 1);
  }

  async function savePlaceholder(form) {
    setPlaceholderStatus({ state: 'loading', message: 'Saving placeholder...' });
    const editingId = placeholderEditor.mode === 'edit' ? placeholderEditor.booking?.placeholder_id || placeholderEditor.booking?.id : null;
    const selectedCourtIds = getSelectedCourtIds(form);
    const { court_ids: _courtIds, duration_mode: _durationMode, ...formPayload } = form;

    if (!selectedCourtIds.length) {
      throw new Error('Select at least one court.');
    }

    const buildPayload = (courtId) => {
      const court = state.courts.find((item) => item.id === courtId);
      const payload = {
        ...formPayload,
        mitra_id: mitraId,
        court_id: courtId,
        court_name: court?.name || form.court_name || '',
      };
      if (canViewRevenue) {
        payload.estimated_price = Number(form.estimated_price || 0);
      } else {
        delete payload.estimated_price;
      }
      return payload;
    };

    try {
      if (editingId) {
        const saved = await apiRequest(`/api/placeholder-bookings/${editingId}`, {
          method: 'PUT',
          body: JSON.stringify(buildPayload(form.court_id || selectedCourtIds[0])),
        });
        setPlaceholderStatus({ state: 'success', message: 'Placeholder saved.' });
        setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
        requestCalendarRefresh();
        if (saved?.data) setSelectedBooking(normalizePlaceholderBooking(saved.data));
        return;
      }

      // Each court is an independent POST. Use allSettled so one failure does
      // not discard the placeholders that did save (Promise.all would still
      // fire every request but report the whole batch as failed).
      const results = await Promise.allSettled(selectedCourtIds.map((courtId) => apiRequest('/api/placeholder-bookings', {
        method: 'POST',
        body: JSON.stringify(buildPayload(courtId)),
      })));
      const saved = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failed = results.filter((result) => result.status === 'rejected');

      // Nothing saved: surface the error in the still-open editor so the user
      // can retry without creating duplicates.
      if (!saved.length) throw failed[0].reason;

      requestCalendarRefresh();
      const firstSaved = saved.map((item) => item?.data).find(Boolean);
      if (firstSaved) setSelectedBooking(normalizePlaceholderBooking(firstSaved));

      // Partial success: the saved courts are committed, so close the editor to
      // avoid duplicate re-submits and report which courts still need attention.
      if (failed.length) {
        setPlaceholderStatus({
          state: 'error',
          message: `Saved ${saved.length} of ${selectedCourtIds.length} placeholders. ${failed.length} failed: ${failed[0].reason?.message || 'unknown error'}`,
        });
        setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
        return;
      }

      setPlaceholderStatus({
        state: 'success',
        message: saved.length > 1 ? `${saved.length} placeholders saved.` : 'Placeholder saved.',
      });
      setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
    } catch (error) {
      // Clear the loading state so the submit button recovers; rethrow so the
      // editor can surface the friendly conflict message inline.
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save placeholder.' });
      throw error;
    }
  }

  async function deletePlaceholder(booking) {
    const id = booking?.placeholder_id || booking?.id;
    if (!id) return;
    setPlaceholderStatus({ state: 'loading', message: 'Deleting placeholder...' });
    await apiRequest(`/api/placeholder-bookings/${id}`, { method: 'DELETE' });
    setPlaceholderStatus({ state: 'success', message: 'Placeholder deleted.' });
    setSelectedBooking(null);
    requestCalendarRefresh();
  }

  async function saveRealBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    const isPlaceholderConversion = Boolean(booking?.is_placeholder);
    const placeholderId = booking?.placeholder_id || booking?.id;
    if (isPlaceholderConversion && !placeholderId) throw new Error('Placeholder booking ID is missing.');

    const bookingDates = isPlaceholderConversion ? [form.date].filter(Boolean) : getBookingFormDates(form);
    const selectedCourtIds = isPlaceholderConversion ? [form.court_id].filter(Boolean) : getSelectedCourtIds(form);
    const bulkCount = bookingDates.length * selectedCourtIds.length;
    const createdBookings = [];
    let currentDate = '';
    if (!bookingDates.length) throw new Error('Select at least one date.');
    if (!selectedCourtIds.length) throw new Error('Select at least one court.');

    setPlaceholderStatus({
      state: 'loading',
      message: isPlaceholderConversion ? 'Converting placeholder...' : bulkCount > 1 ? `Creating ${bulkCount} bookings...` : 'Creating booking...',
    });

    try {
      for (const date of bookingDates) {
        currentDate = date;
        for (const courtId of selectedCourtIds) {
          const response = await apiRequest('/api/admin/court-booking', {
            method: 'POST',
            body: JSON.stringify(buildCourtBookingPayload({ form: { ...form, court_id: courtId, date }, mitraId })),
          });

          const bookingId = response?.booking_id || response?.data?.booking_id || response?.id || '';
          const transId = response?.trans_id || response?.data?.trans_id || '';
          createdBookings.push({ bookingId, courtId, date, transId });
        }
      }

      const warnings = [];

      if (form.receiptFile) {
        for (const createdBooking of createdBookings) {
          if (!createdBooking.transId) {
            const court = state.courts.find((item) => item.id === createdBooking.courtId);
            warnings.push(`Receipt was not uploaded for ${court?.name ? `${court.name} on ` : ''}${formatLongDate(createdBooking.date)} because the booking response did not include a transaction ID.`);
          } else {
            try {
              await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: createdBooking.transId });
            } catch (uploadError) {
              const court = state.courts.find((item) => item.id === createdBooking.courtId);
              warnings.push(`Receipt upload failed for ${court?.name ? `${court.name} on ` : ''}${formatLongDate(createdBooking.date)}: ${uploadError.message}`);
            }
          }
        }
      }

      if (isPlaceholderConversion) {
        try {
          await apiRequest(`/api/placeholder-bookings/${placeholderId}`, { method: 'DELETE' });
        } catch (deleteError) {
          warnings.push(`Real booking was created, but the placeholder could not be removed: ${deleteError.message}`);
        }
      }

      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({
        state: warnings.length ? 'warning' : 'success',
        message: warnings.length
          ? `${bulkCount > 1 ? `${bulkCount} bookings created` : `Booking created${createdBookings[0]?.bookingId ? ` (${createdBookings[0].bookingId})` : ''}`}. ${warnings.join(' ')}`
          : isPlaceholderConversion ? 'Placeholder converted to a real booking.' : bulkCount > 1 ? `${bulkCount} bookings created.` : 'Booking created.',
      });
      requestCalendarRefresh();
    } catch (convertError) {
      const partialMessage = createdBookings.length
        ? `${createdBookings.length} of ${bulkCount} bookings were created before ${formatLongDate(currentDate)} failed. `
        : '';
      const message = `${partialMessage}${convertError.message || 'Unable to save booking.'}`;
      setPlaceholderStatus({ state: 'error', message });
      if (createdBookings.length) requestCalendarRefresh();
      throw new Error(message);
    }
  }

  async function markBookingPaid(booking) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Marking booking paid...' });
    try {
      await apiRequest('/api/admin/pay-court-booking', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          payment_method: 'offline',
        }),
      });
      setPlaceholderStatus({ state: 'success', message: 'Booking marked paid.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to mark booking paid.' });
      throw error;
    }
  }

  async function savePaymentProof(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    if (!booking?.trans_id) throw new Error('This booking does not have a transaction ID for attachment upload.');
    if (!form.receiptFile) throw new Error('Select a transfer receipt first.');
    setPlaceholderStatus({ state: 'loading', message: 'Uploading receipt...' });
    try {
      await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: booking.trans_id });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setPlaceholderStatus({ state: 'success', message: 'Receipt uploaded.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to upload receipt.' });
      throw error;
    }
  }

  async function rescheduleBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Rescheduling booking...' });
    try {
      await apiRequest('/api/admin/reschedule-court-time', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          date: form.date,
          type: getCourtBookingWriteType(booking),
          court_id: form.court_id,
          start_hours: formatUpstreamTime(form.start_time),
          duration: getTimeRangeDurationMinutes(form),
          adjust_payment: true,
          adjust_payment_method: 'offline',
        }),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({ state: 'success', message: 'Booking rescheduled.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to reschedule booking.' });
      throw error;
    }
  }

  async function cancelBooking(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Canceling booking...' });
    try {
      const detailedBooking = await fetchBookingDetailForAction({ booking, mitraId }).catch(() => booking);
      await apiRequest('/api/admin/cancel-cal-court', {
        method: 'POST',
        body: JSON.stringify(buildCancelBookingPayload({ booking: detailedBooking, form, mitraId })),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setSelectedBooking(null);
      setPlaceholderStatus({ state: 'success', message: 'Booking canceled.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to cancel booking.' });
      throw error;
    }
  }

  async function saveBookingNotes(booking, form) {
    if (!canWriteBookings) throw new Error('This virtual user needs Calendar booking permission to write real bookings.');
    setPlaceholderStatus({ state: 'loading', message: 'Saving notes...' });
    try {
      await apiRequest('/api/admin/change-notes', {
        method: 'POST',
        body: JSON.stringify({
          mitra_id: mitraId,
          id: booking.id,
          type: getCourtBookingWriteType(booking),
          notes: form.notes || '',
        }),
      });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setPlaceholderStatus({ state: 'success', message: 'Booking notes saved.' });
      requestCalendarRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save notes.' });
      throw error;
    }
  }

  function findPlaceholderConflicts(form) {
    const bookings = state.bookingsByDate[form.date] || [];
    const selectedCourtIds = new Set(getSelectedCourtIds(form));
    const candidate = {
      time: `${form.start_time}-${form.end_time}`,
    };
    const editingIds = new Set([placeholderEditor.booking?.id, placeholderEditor.booking?.placeholder_id].filter(Boolean));
    return bookings.filter((booking) => {
      if (editingIds.has(booking.id) || editingIds.has(booking.placeholder_id)) return false;
      return selectedCourtIds.has(booking.court_id) && bookingsOverlap(candidate, booking);
    });
  }

  function findRealBookingConflicts(form, sourceBooking = null) {
    const candidate = {
      time: `${form.start_time}-${form.end_time}`,
    };
    const sourceIds = new Set([sourceBooking?.id, sourceBooking?.placeholder_id].filter(Boolean));
    const selectedCourtIds = new Set(getSelectedCourtIds(form));
    return getBookingFormDates(form).flatMap((date) => {
      const bookings = state.bookingsByDate[date] || [];
      return bookings.filter((booking) => {
        if (sourceIds.has(booking.id) || sourceIds.has(booking.placeholder_id)) return false;
        return !booking.is_placeholder && selectedCourtIds.has(booking.court_id) && bookingsOverlap(candidate, booking);
      }).map((booking) => ({ ...booking, conflict_date: date }));
    });
  }

  return (
    <div className={`calendar-page ${view}-mode ${showCalendarFeedback ? 'has-feedback' : ''} ${isMobileApp ? 'mobile-calendar-page' : ''}`}>
      <header className="calendar-topbar">
        <div>
          <h1>Calendar</h1>
          <p>{view === 'day' ? 'Manage daily court bookings and availability.' : 'Plan weekly occupancy and jump into daily operations.'}</p>
        </div>
        <div className="topbar-actions">
          {!isMobileApp && onUseMobileView ? (
            <button className="desktop-view-toggle-button" onClick={onUseMobileView} type="button">
              Mobile app view
            </button>
          ) : null}
          <span className="user-chip">{displayName}</span>
          <button className="logout-button" onClick={onLogout} type="button">
            <LogOut size={17} />
            Logout
          </button>
        </div>
      </header>

      <section className="calendar-toolbar">
        <div className="toolbar-nav">
          <div className="segmented-control">
            <button className={view === 'day' ? 'selected' : ''} onClick={() => setView('day')} type="button">Day</button>
            <button className={view === 'week' ? 'selected' : ''} onClick={() => setView('week')} type="button">Week</button>
          </div>
          <div className="date-controls">
            <button aria-label="Previous" onClick={() => (view === 'day' ? moveDate(-1) : moveWeek(-1))} type="button">
              <ChevronLeft size={16} />
            </button>
            <input
              aria-label="Selected date"
              onChange={(event) => setSelectedDate(event.target.value)}
              type="date"
              value={selectedDate}
            />
            <button aria-label="Next" onClick={() => (view === 'day' ? moveDate(1) : moveWeek(1))} type="button">
              <ChevronRight size={16} />
            </button>
          </div>
          <button className="today-button" onClick={() => setSelectedDate(toDateInputValue(new Date()))} type="button">
            <CalendarCheck size={16} />
            Today
          </button>
          <button aria-label="Refresh calendar" className="toolbar-icon-button" onClick={requestCalendarRefresh} type="button">
            <RefreshCw size={15} />
          </button>
        </div>
        <div className="toolbar-actions">
          <div className="open-hours">
            <Clock size={14} />
            {formatAvailabilityRange(
              parseTimeToMinutes(state.openHour?.open_hours || '06:00'),
              parseTimeToMinutes(state.openHour?.close_hours || '24:00'),
            )}
          </div>
          {!isMobileApp ? (
            <button
              className={`summary-toggle-button ${showSummaryPanel ? 'selected' : ''}`}
              onClick={() => setShowSummaryPanel((current) => !current)}
              type="button"
            >
              <ClipboardList size={15} />
              Summary
            </button>
          ) : null}
          <button className="placeholder-create-button" onClick={openCreatePlaceholder} type="button">
            <Plus size={16} />
            Placeholder
          </button>
          {canWriteBookings ? (
            <button className="real-booking-create-button" onClick={() => openCreateRealBooking()} type="button">
              <CheckCircle2 size={16} />
              Booking
            </button>
          ) : null}
        </div>
      </section>

      {showCalendarFeedback ? (
        <div className="calendar-feedback">
          {state.error ? (
            <div className="calendar-error">
              <strong>Could not load calendar.</strong>
              <p>{state.error}</p>
            </div>
          ) : null}

          {placeholderStatus.message && !isPlaceholderEditorOpen && !isBookingActionEditorOpen ? (
            <div className={`calendar-status-message ${placeholderStatus.state}`} role="status">
              <span>{placeholderStatus.message}</span>
              {placeholderStatus.state !== 'loading' ? (
                <button
                  aria-label="Dismiss status message"
                  onClick={() => setPlaceholderStatus({ state: 'idle', message: '' })}
                  type="button"
                >
                  <X size={14} />
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}

      <section className={`calendar-layout ${showDetailPanel ? '' : 'summary-collapsed'}`}>
        <div className="calendar-main-panel">
          <div className="calendar-scroll-area" ref={calendarPanelRef}>
            {state.loading ? (
              <div className="calendar-loading">Loading calendar...</div>
            ) : isMobileApp && view === 'day' ? (
              <MobileDayAgenda
                bookings={activeBookings}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onSelectBooking={setSelectedBooking}
                onSelectFreeSlot={openSlotChoice}
              />
            ) : isMobileApp && view === 'week' ? (
              <MobileWeekCalendar
                bookingsByDate={state.bookingsByDate}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSelectFreeSlot={openSlotChoice}
                onSwitchDay={() => setView('day')}
              />
            ) : view === 'day' ? (
              <DayCalendar
                bookings={activeBookings}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedBooking={selectedBooking}
                selectedDate={selectedDate}
                onSelectBooking={setSelectedBooking}
                onSelectFreeSlot={openSlotChoice}
              />
            ) : (
              <WeekCalendar
                bookingsByDate={state.bookingsByDate}
                canViewRevenue={canViewRevenue}
                courts={state.courts}
                openHour={state.openHour}
                selectedDate={selectedDate}
                weekDays={weekDays}
                onSelectBooking={setSelectedBooking}
                onSelectDate={setSelectedDate}
                onSelectFreeSlot={openSlotChoice}
                onSwitchDay={() => setView('day')}
              />
            )}
          </div>
          {view === 'day' && hiddenAboveCount > 0 ? (
            <div className="scroll-more-indicator above">
              <span>{hiddenAboveCount} hidden above</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
          {view === 'day' && hiddenBelowCount > 0 ? (
            <div className="scroll-more-indicator below">
              <span>{hiddenBelowCount} hidden below</span>
              <ChevronRight size={16} />
            </div>
          ) : null}
        </div>
        {showDetailPanel ? (
          <CalendarDetailPanel
            booking={selectedBooking}
            canViewRevenue={canViewRevenue}
            canWriteBookings={canWriteBookings}
            selectedDate={selectedDate}
            selectedDaySummary={selectedDaySummary}
            view={view}
            weekSummary={weekSummary}
            onClose={closeCalendarDetail}
            onCancelBooking={openCancelBooking}
            onConvertPlaceholder={openConvertPlaceholder}
            onCreatePlaceholder={openCreatePlaceholder}
            onDeletePlaceholder={deletePlaceholder}
            onEditPlaceholder={openEditPlaceholder}
            onEditBookingNotes={openBookingNotes}
            onMarkBookingPaid={markBookingPaid}
            onOpenDay={() => setView('day')}
            onRescheduleBooking={openRescheduleBooking}
            onUploadPaymentProof={openPaymentProof}
          />
        ) : null}
      </section>
      {isMobileApp ? (
        <button className="mobile-placeholder-fab" onClick={() => openSlotChoice()} type="button">
          <Plus size={20} />
        </button>
      ) : null}
      {isSlotChoiceOpen ? (
        <SlotChoiceDialog
          draft={slotChoice.draft}
          onChoosePlaceholder={chooseSlotPlaceholder}
          onChooseRealBooking={chooseSlotRealBooking}
          onClose={closeSlotChoice}
        />
      ) : null}
      {placeholderEditor.mode !== 'closed' ? (
        <PlaceholderBookingEditor
          booking={placeholderEditor.booking}
          canViewRevenue={canViewRevenue}
          conflicts={findPlaceholderConflicts}
          courts={state.courts}
          defaultDate={selectedDate}
          defaultName={displayName}
          draft={placeholderEditor.draft}
          isSaving={placeholderStatus.state === 'loading'}
          isVirtualUser={isVirtualUser}
          mode={placeholderEditor.mode}
          openHour={state.openHour}
          onClose={closePlaceholderEditor}
          onSave={savePlaceholder}
        />
      ) : null}
      {['create-booking', 'convert-placeholder'].includes(bookingActionEditor.mode) ? (
        <BookingWriteDialog
          actionMode={bookingActionEditor.mode}
          booking={bookingActionEditor.booking}
          canViewRevenue={canViewRevenue}
          conflicts={findRealBookingConflicts}
          courts={state.courts}
          defaultDate={selectedDate}
          draft={bookingActionEditor.draft}
          isSaving={placeholderStatus.state === 'loading'}
          openHour={state.openHour}
          onClose={closeBookingActionEditor}
          onSave={saveRealBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'payment-proof' ? (
        <PaymentProofDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={savePaymentProof}
        />
      ) : null}
      {bookingActionEditor.mode === 'reschedule' ? (
        <RescheduleBookingDialog
          booking={bookingActionEditor.booking}
          canViewRevenue={canViewRevenue}
          courts={state.courts}
          isSaving={placeholderStatus.state === 'loading'}
          mitraId={mitraId}
          openHour={state.openHour}
          onClose={closeBookingActionEditor}
          onSave={rescheduleBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'cancel' ? (
        <CancelBookingDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={cancelBooking}
        />
      ) : null}
      {bookingActionEditor.mode === 'notes' ? (
        <BookingNotesDialog
          booking={bookingActionEditor.booking}
          isSaving={placeholderStatus.state === 'loading'}
          onClose={closeBookingActionEditor}
          onSave={saveBookingNotes}
        />
      ) : null}
      {isMobileApp && selectedBooking ? (
        <div className="mobile-detail-backdrop" onClick={() => setSelectedBooking(null)}>
          <div onClick={(event) => event.stopPropagation()}>
            <CalendarDetailPanel
              booking={selectedBooking}
              canViewRevenue={canViewRevenue}
              canWriteBookings={canWriteBookings}
              selectedDate={selectedDate}
              selectedDaySummary={selectedDaySummary}
              view={view}
              weekSummary={weekSummary}
              onClose={() => setSelectedBooking(null)}
              onCancelBooking={openCancelBooking}
              onConvertPlaceholder={openConvertPlaceholder}
              onCreatePlaceholder={openCreatePlaceholder}
              onDeletePlaceholder={deletePlaceholder}
              onEditPlaceholder={openEditPlaceholder}
              onEditBookingNotes={openBookingNotes}
              onMarkBookingPaid={markBookingPaid}
              onOpenDay={() => setView('day')}
              onRescheduleBooking={openRescheduleBooking}
              onUploadPaymentProof={openPaymentProof}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}


