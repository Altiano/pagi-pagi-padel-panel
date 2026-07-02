// Calendar feature controller: owns visible wiring between calendar state,
// write workflows, grid views, detail panels, and dialogs.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  Trash2,
  X,
} from 'lucide-react';
import { APP_BUILD_TIMESTAMP } from '../constants.js';
import { useEscapeKey, useSheetDrag } from '../hooks.js';
import {
  formatAvailabilityRange,
  formatBuildVersion,
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
import { MobileAccountSheet, MobileCalendarHeader, MobileDateSheet } from './MobileCalendarChrome.jsx';
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

export function CalendarPage({ cacheScope = 'session', canViewRevenue = true, canWriteBookings = true, displayName, isMobileApp = false, isVirtualUser = false, mitraId, onLogout, onUseDesktopView, onUseMobileView }) {
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
  // Mobile chrome state: which bottom sheet is open, the court filter chip,
  // and the pull-to-refresh gesture progress.
  const [mobileSheet, setMobileSheet] = useState('none');
  const [mobileCourtFilter, setMobileCourtFilter] = useState('all');
  const [pullDistance, setPullDistance] = useState(0);
  const [pullRefreshing, setPullRefreshing] = useState(false);
  const mobileGestureRef = useRef({ allowDaySwipe: false, pulling: false, startX: 0, startY: 0 });
  // Week-view multi-select: Ctrl/Cmd-click placeholder cards to batch-delete them.
  const [selectedPlaceholders, setSelectedPlaceholders] = useState([]);
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
  const { deletePlaceholder, deletePlaceholders, savePlaceholder } = usePlaceholderActions({
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

  const clearPlaceholderSelection = useCallback(() => setSelectedPlaceholders([]), []);

  // Drop the multi-select whenever the visible scope changes (view switch or week change).
  useEffect(() => {
    setSelectedPlaceholders([]);
  }, [view, selectedDate]);

  const handleWeekSelectBooking = useCallback((booking, event) => {
    if ((event?.ctrlKey || event?.metaKey) && booking?.is_placeholder) {
      event.preventDefault();
      setSelectedPlaceholders((current) => (
        current.some((item) => item.id === booking.id)
          ? current.filter((item) => item.id !== booking.id)
          : [...current, booking]
      ));
      return;
    }
    setSelectedPlaceholders([]);
    setSelectedBooking(booking);
  }, [setSelectedBooking]);

  const deleteSelectedPlaceholders = useCallback(async () => {
    const toDelete = selectedPlaceholders;
    setSelectedPlaceholders([]);
    await deletePlaceholders(toDelete);
  }, [deletePlaceholders, selectedPlaceholders]);

  const selectedPlaceholderIds = useMemo(() => selectedPlaceholders.map((item) => item.id), [selectedPlaceholders]);

  // Fall back to "all courts" if the filtered court disappears (mitra switch).
  const mobileCourtScope = state.courts.some((court) => court.id === mobileCourtFilter) ? mobileCourtFilter : 'all';
  const mobileOverlayOpen = isSlotChoiceOpen || isPlaceholderEditorOpen || isBookingActionEditorOpen
    || Boolean(selectedBooking) || mobileSheet !== 'none';

  // Clear the pull-to-refresh spinner once the reload lands.
  useEffect(() => {
    if (!state.loading) setPullRefreshing(false);
  }, [state.loading]);

  // Native-style gestures on the calendar screen: pull down from the top to
  // refresh, swipe horizontally on the agenda to move between days. The day
  // strip and chip row stop propagation for their own horizontal gestures.
  function handleMobileTouchStart(event) {
    const touch = event.touches[0];
    mobileGestureRef.current = {
      allowDaySwipe: Boolean(event.target.closest('.calendar-layout')),
      pulling: window.scrollY <= 0,
      startX: touch.clientX,
      startY: touch.clientY,
    };
  }

  function handleMobileTouchMove(event) {
    if (!mobileGestureRef.current.pulling || mobileOverlayOpen) return;
    const deltaY = event.touches[0].clientY - mobileGestureRef.current.startY;
    const deltaX = Math.abs(event.touches[0].clientX - mobileGestureRef.current.startX);
    if (deltaY <= 0 || deltaX > deltaY) {
      if (pullDistance) setPullDistance(0);
      return;
    }
    setPullDistance(Math.min(deltaY * 0.45, 84));
  }

  function handleMobileTouchEnd(event) {
    if (mobileOverlayOpen) {
      setPullDistance(0);
      return;
    }
    const touch = event.changedTouches[0];
    const deltaX = touch.clientX - mobileGestureRef.current.startX;
    const deltaY = touch.clientY - mobileGestureRef.current.startY;
    if (mobileGestureRef.current.allowDaySwipe && view === 'day'
      && Math.abs(deltaX) > 64 && Math.abs(deltaX) > Math.abs(deltaY) * 1.6) {
      moveDate(deltaX < 0 ? 1 : -1);
    }
    if (pullDistance > 58) {
      setPullRefreshing(true);
      requestCalendarRefresh();
    }
    setPullDistance(0);
  }

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
    if (mobileSheet !== 'none') {
      setMobileSheet('none');
      return;
    }
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
    if (selectedPlaceholders.length) {
      setSelectedPlaceholders([]);
      return;
    }
    closeCalendarDetail();
  }, mobileSheet !== 'none' || isSlotChoiceOpen || isBookingActionEditorOpen || isPlaceholderEditorOpen || selectedPlaceholders.length > 0 || Boolean(selectedBooking) || showSummaryPanel);

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
    <div
      className={`calendar-page ${view}-mode ${showCalendarFeedback ? 'has-feedback' : ''} ${isMobileApp ? 'mobile-calendar-page' : ''}`}
      onTouchEnd={isMobileApp ? handleMobileTouchEnd : undefined}
      onTouchMove={isMobileApp ? handleMobileTouchMove : undefined}
      onTouchStart={isMobileApp ? handleMobileTouchStart : undefined}
    >
      {isMobileApp ? (
        <>
          <MobileCalendarHeader
            bookingCount={activeBookings.length}
            courtFilter={mobileCourtScope}
            courts={state.courts}
            displayName={displayName}
            selectedDate={selectedDate}
            view={view}
            weekDays={weekDays}
            onMoveWeek={moveWeek}
            onOpenAccount={() => setMobileSheet('account')}
            onOpenDateSheet={() => setMobileSheet('date')}
            onSelectCourtFilter={setMobileCourtFilter}
            onSelectDate={setSelectedDate}
            onSelectToday={() => setSelectedDate(toDateInputValue(new Date()))}
          />
          {pullDistance > 0 || pullRefreshing ? (
            <div
              aria-hidden={!pullRefreshing}
              className={`mobile-pull-indicator ${pullRefreshing ? 'refreshing' : ''}`}
              role="status"
              style={{ height: pullRefreshing ? 46 : pullDistance }}
            >
              <RefreshCw size={17} style={pullRefreshing ? undefined : { transform: `rotate(${pullDistance * 3.4}deg)` }} />
            </div>
          ) : null}
        </>
      ) : (
        <>
          <header className="calendar-topbar">
            <div>
              <h1>Calendar</h1>
              <p>{view === 'day' ? 'Manage daily court bookings and availability.' : 'Plan weekly occupancy and jump into daily operations.'}</p>
            </div>
            <div className="topbar-actions">
              {onUseMobileView ? (
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
              <button
                className={`summary-toggle-button ${showSummaryPanel ? 'selected' : ''}`}
                onClick={() => setShowSummaryPanel((current) => !current)}
                type="button"
              >
                <ClipboardList size={15} />
                Summary
              </button>
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
        </>
      )}

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
                courtFilter={mobileCourtScope}
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
                selectedPlaceholderIds={selectedPlaceholderIds}
                weekDays={weekDays}
                onSelectBooking={handleWeekSelectBooking}
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
          {!isMobileApp && view === 'week' && selectedPlaceholders.length > 0 ? (
            <div className="placeholder-multiselect-bar" role="toolbar" aria-label="Selected placeholders">
              <span className="placeholder-multiselect-count">
                {selectedPlaceholders.length} placeholder{selectedPlaceholders.length === 1 ? '' : 's'} selected
              </span>
              <button
                className="placeholder-multiselect-delete"
                disabled={placeholderStatus.state === 'loading'}
                onClick={deleteSelectedPlaceholders}
                type="button"
              >
                <Trash2 size={15} />
                Delete
              </button>
              <button
                aria-label="Clear selection"
                className="placeholder-multiselect-clear"
                onClick={clearPlaceholderSelection}
                type="button"
              >
                <X size={15} />
              </button>
            </div>
          ) : null}
        </div>
        {showDetailPanel ? (
          <CalendarDetailPanel
            booking={selectedBooking}
            canViewRevenue={canViewRevenue}
            canWriteBookings={canWriteBookings}
            displayName={displayName}
            isVirtualUser={isVirtualUser}
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
        <button aria-label="Create booking or placeholder" className="mobile-placeholder-fab" onClick={() => openSlotChoice()} type="button">
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
      {isMobileApp && mobileSheet === 'date' ? (
        <MobileDateSheet
          bookingsByDate={state.bookingsByDate}
          selectedDate={selectedDate}
          view={view}
          onClose={() => setMobileSheet('none')}
          onSelectDate={setSelectedDate}
          onSetView={setView}
        />
      ) : null}
      {isMobileApp && mobileSheet === 'account' ? (
        <MobileAccountSheet
          buildVersion={formatBuildVersion(APP_BUILD_TIMESTAMP)}
          displayName={displayName}
          onClose={() => setMobileSheet('none')}
          onLogout={onLogout}
          onRefresh={requestCalendarRefresh}
          onUseDesktopView={onUseDesktopView}
        />
      ) : null}
      {isMobileApp && selectedBooking ? (
        <MobileBookingSheet onClose={() => setSelectedBooking(null)}>
            <CalendarDetailPanel
              booking={selectedBooking}
              canViewRevenue={canViewRevenue}
              canWriteBookings={canWriteBookings}
              displayName={displayName}
              isVirtualUser={isVirtualUser}
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
        </MobileBookingSheet>
      ) : null}
    </div>
  );
}

/* Bottom sheet for the mobile booking detail: swipe down on it (from the top
   of its scroll area) to dismiss, like a native sheet. */
function MobileBookingSheet({ children, onClose }) {
  const drag = useSheetDrag(onClose);

  return (
    <div className="mobile-detail-backdrop" onClick={onClose}>
      <div
        className="mobile-detail-sheet"
        onClick={(event) => event.stopPropagation()}
        {...drag.handlers}
        style={drag.style}
      >
        {children}
      </div>
    </div>
  );
}
