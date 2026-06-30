// Calendar feature controller: owns visible wiring between calendar state,
// write workflows, grid views, detail panels, and dialogs.
import { useCallback, useMemo, useState } from 'react';
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
import { useEscapeKey } from '../hooks.js';
import {
  formatAvailabilityRange,
  parseTimeToMinutes,
  toDateInputValue,
} from '../lib/datetime.js';
import {
  bookingsOverlap,
  summarizeDay,
  summarizeWeek,
} from '../lib/bookings.js';
import {
  getBookingFormDates,
  getSelectedCourtIds,
} from './forms.js';
import { DayCalendar, MobileDayAgenda, MobileWeekCalendar, WeekCalendar } from './CalendarViews.jsx';
import { CalendarDetailPanel } from './CalendarDetailPanel.jsx';
import { BookingNotesDialog } from './BookingNotesDialog.jsx';
import { BookingWriteDialog } from './BookingWriteDialog.jsx';
import { CancelBookingDialog } from './CancelBookingDialog.jsx';
import { PaymentProofDialog } from './PaymentProofDialog.jsx';
import { PlaceholderBookingEditor } from './PlaceholderBookingEditor.jsx';
import { RescheduleBookingDialog } from './RescheduleBookingDialog.jsx';
import { SlotChoiceDialog } from './SlotChoiceDialog.jsx';
import { useCalendarData } from './useCalendarData.js';
import { useCalendarScrollIndicators } from './useCalendarScrollIndicators.js';
import { useCalendarSelection } from './useCalendarSelection.js';
import { usePlaceholderActions } from './usePlaceholderActions.js';
import { useRealBookingActions } from './useRealBookingActions.js';

export function CalendarPage({ cacheScope = 'session', canViewRevenue = true, canWriteBookings = true, displayName, isMobileApp = false, isVirtualUser = false, mitraId, onLogout, onUseMobileView }) {
  const {
    closeCalendarDetail,
    moveDate,
    moveWeek,
    selectedBooking,
    selectedDate,
    setSelectedBooking,
    setSelectedDate,
    setShowSummaryPanel,
    setView,
    showSummaryPanel,
    view,
    weekDays,
  } = useCalendarSelection({ isMobileApp });
  const [placeholderEditor, setPlaceholderEditor] = useState({ mode: 'closed', booking: null });
  const [bookingActionEditor, setBookingActionEditor] = useState({ mode: 'closed', booking: null, draft: null });
  const [slotChoice, setSlotChoice] = useState({ open: false, draft: null });
  const [placeholderStatus, setPlaceholderStatus] = useState({ state: 'idle', message: '' });
  const clearSelectedBooking = useCallback(() => setSelectedBooking(null), [setSelectedBooking]);
  const { calendarState: state, requestCalendarRefresh } = useCalendarData({
    cacheScope,
    mitraId,
    onSelectionScopeChange: clearSelectedBooking,
    selectedDate,
    weekDays,
  });

  const activeBookings = useMemo(() => state.bookingsByDate[selectedDate] || [], [selectedDate, state.bookingsByDate]);
  const {
    calendarPanelRef,
    hiddenAboveCount,
    hiddenBelowCount,
  } = useCalendarScrollIndicators({
    activeBookings,
    isLoading: state.loading,
    openHour: state.openHour,
    selectedDate,
    view,
  });
  const selectedDaySummary = summarizeDay(activeBookings, state.openHour, state.courts.length, canViewRevenue);
  const weekSummary = summarizeWeek(weekDays, state.bookingsByDate, state.openHour, state.courts.length, canViewRevenue);
  const showDetailPanel = !isMobileApp && (selectedBooking || showSummaryPanel);
  const isPlaceholderEditorOpen = placeholderEditor.mode !== 'closed';
  const isBookingActionEditorOpen = bookingActionEditor.mode !== 'closed';
  const isSlotChoiceOpen = slotChoice.open;
  const showCalendarFeedback = Boolean(state.error || (placeholderStatus.message && !isPlaceholderEditorOpen && !isBookingActionEditorOpen));
  const { deletePlaceholder, savePlaceholder } = usePlaceholderActions({
    canViewRevenue,
    courts: state.courts,
    mitraId,
    onRefresh: requestCalendarRefresh,
    placeholderEditor,
    setPlaceholderEditor,
    setPlaceholderStatus,
    setSelectedBooking,
  });
  const {
    cancelBooking,
    markBookingPaid,
    rescheduleBooking,
    saveBookingNotes,
    savePaymentProof,
    saveRealBooking,
  } = useRealBookingActions({
    canWriteBookings,
    courts: state.courts,
    mitraId,
    onRefresh: requestCalendarRefresh,
    setBookingActionEditor,
    setPlaceholderStatus,
    setSelectedBooking,
  });

  function closePlaceholderEditor() {
    setPlaceholderEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeBookingActionEditor() {
    setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
  }

  function closeSlotChoice() {
    setSlotChoice({ open: false, draft: null });
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
