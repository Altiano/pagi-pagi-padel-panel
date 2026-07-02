// Mobile-only calendar chrome, shaped like a native app: a compact sticky
// header (month title, today pill, avatar) with the week day strip and court
// filter chips, plus the bottom sheets it opens (month-grid date picker with
// the day/week toggle, and the account sheet holding logout / desktop switch).
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronLeft, ChevronRight, LogOut, Monitor, RefreshCw } from 'lucide-react';
import { useSheetDrag } from '../hooks.js';
import {
  buildMonthMatrix,
  formatMonthLabel,
  formatWeekday,
  shiftDate,
  shiftMonth,
  toDateInputValue,
} from '../lib/datetime.js';

export function MobileCalendarHeader({
  bookingCount,
  courtFilter,
  courts,
  displayName,
  onMoveWeek,
  onOpenAccount,
  onOpenDateSheet,
  onSelectCourtFilter,
  onSelectDate,
  onSelectToday,
  selectedDate,
  view,
  weekDays,
}) {
  const dayStripRef = useRef(null);
  const dayStripScrollTimerRef = useRef(null);
  const resettingDayStripRef = useRef(false);
  const today = toDateInputValue(new Date());
  const showTodayPill = view === 'day' ? selectedDate !== today : !weekDays.includes(today);
  const visibleWeekStart = weekDays[0];
  const weekPages = useMemo(() => [-1, 0, 1].map((weekOffset) => ({
    days: weekDays.map((date) => shiftDate(date, weekOffset * 7)),
    weekOffset,
  })), [weekDays]);

  useLayoutEffect(() => {
    const strip = dayStripRef.current;
    if (!strip || view !== 'day') return;

    resettingDayStripRef.current = true;
    strip.scrollLeft = strip.clientWidth;
    requestAnimationFrame(() => {
      resettingDayStripRef.current = false;
    });
  }, [view, visibleWeekStart]);

  useEffect(() => () => {
    window.clearTimeout(dayStripScrollTimerRef.current);
  }, []);

  function handleDayStripScroll() {
    if (resettingDayStripRef.current) return;

    window.clearTimeout(dayStripScrollTimerRef.current);
    dayStripScrollTimerRef.current = window.setTimeout(() => {
      const strip = dayStripRef.current;
      if (!strip) return;

      const pageWidth = strip.clientWidth;
      if (!pageWidth) return;

      const offsetFromCurrentWeek = strip.scrollLeft - pageWidth;
      if (Math.abs(offsetFromCurrentWeek) < pageWidth * 0.45) {
        strip.scrollTo({ behavior: 'smooth', left: pageWidth });
        return;
      }

      onMoveWeek(offsetFromCurrentWeek > 0 ? 1 : -1);
    }, 120);
  }

  return (
    <header className="mobile-cal-header">
      <div className="mobile-cal-titlebar">
        <button className="mobile-month-button" onClick={onOpenDateSheet} type="button">
          {formatMonthLabel(selectedDate)}
          <ChevronDown size={17} />
        </button>
        <div className="mobile-cal-titlebar-actions">
          {showTodayPill ? (
            <button className="mobile-today-pill" onClick={onSelectToday} type="button">Today</button>
          ) : null}
          <button
            aria-label="Account and app options"
            className="mobile-avatar-button"
            onClick={onOpenAccount}
            type="button"
          >
            {getInitial(displayName)}
          </button>
        </div>
      </div>

      {view === 'day' ? (
        <div
          aria-label="Scrollable days"
          className="mobile-day-strip"
          onScroll={handleDayStripScroll}
          ref={dayStripRef}
          role="group"
        >
          {weekPages.map(({ days, weekOffset }) => (
            <div className="mobile-day-strip-page" key={weekOffset}>
              {days.map((date) => (
                <button
                  aria-pressed={date === selectedDate}
                  className={`${date === selectedDate ? 'selected' : ''} ${date === today ? 'today' : ''}`}
                  key={date}
                  onClick={() => onSelectDate(date)}
                  tabIndex={weekOffset === 0 ? 0 : -1}
                  type="button"
                >
                  <span>{formatWeekday(date)}</span>
                  <strong>{Number(date.slice(8, 10))}</strong>
                </button>
              ))}
            </div>
          ))}
        </div>
      ) : null}

      {view === 'day' && courts.length > 1 ? (
        <div aria-label="Filter by court" className="mobile-court-chips" role="group">
          <button
            className={courtFilter === 'all' ? 'selected' : ''}
            onClick={() => onSelectCourtFilter('all')}
            type="button"
          >
            All courts
          </button>
          {courts.map((court) => (
            <button
              className={courtFilter === court.id ? 'selected' : ''}
              key={court.id}
              onClick={() => onSelectCourtFilter(court.id)}
              type="button"
            >
              {court.name}
            </button>
          ))}
          <span className="mobile-chip-count">{bookingCount} booking{bookingCount === 1 ? '' : 's'}</span>
        </div>
      ) : null}
    </header>
  );
}

export function MobileDateSheet({ bookingsByDate, onClose, onSelectDate, onSetView, selectedDate, view }) {
  const [monthCursor, setMonthCursor] = useState(selectedDate);
  const drag = useSheetDrag(onClose);
  const today = toDateInputValue(new Date());
  const cells = buildMonthMatrix(monthCursor);

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        className="mobile-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Pick a date"
        {...drag.handlers}
        style={drag.style}
      >
        <div aria-label="Calendar view" className="mobile-view-toggle" role="group">
          <button
            className={view === 'day' ? 'selected' : ''}
            onClick={() => { onSetView('day'); onClose(); }}
            type="button"
          >
            Day
          </button>
          <button
            className={view === 'week' ? 'selected' : ''}
            onClick={() => { onSetView('week'); onClose(); }}
            type="button"
          >
            Week
          </button>
        </div>

        <div className="mobile-month-nav">
          <button aria-label="Previous month" onClick={() => setMonthCursor((current) => shiftMonth(current, -1))} type="button">
            <ChevronLeft size={17} />
          </button>
          <strong>{formatMonthLabel(monthCursor)}</strong>
          <button aria-label="Next month" onClick={() => setMonthCursor((current) => shiftMonth(current, 1))} type="button">
            <ChevronRight size={17} />
          </button>
        </div>

        <div className="mobile-month-grid">
          {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((label, index) => (
            <span aria-hidden="true" key={`${label}-${index}`}>{label}</span>
          ))}
          {cells.map((cell) => (
            <button
              className={[
                cell.value === selectedDate ? 'selected' : '',
                cell.value === today ? 'today' : '',
                cell.inMonth ? '' : 'outside',
                (bookingsByDate[cell.value] || []).length ? 'has-bookings' : '',
              ].join(' ')}
              key={cell.value}
              onClick={() => { onSelectDate(cell.value); onClose(); }}
              type="button"
            >
              {Number(cell.value.slice(8, 10))}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export function MobileAccountSheet({ buildVersion, displayName, onClose, onLogout, onRefresh, onUseDesktopView }) {
  const drag = useSheetDrag(onClose);

  return (
    <div className="mobile-sheet-backdrop" onClick={onClose}>
      <div
        className="mobile-sheet"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="Account and app options"
        {...drag.handlers}
        style={drag.style}
      >
        <div className="mobile-account-identity">
          <span aria-hidden="true" className="mobile-avatar-button large">{getInitial(displayName)}</span>
          <div>
            <strong>{displayName}</strong>
            <span>Pagi Pagi Padel</span>
          </div>
        </div>
        <div className="mobile-account-actions">
          <button onClick={() => { onRefresh(); onClose(); }} type="button">
            <RefreshCw size={17} />
            Refresh data
          </button>
          <button onClick={onUseDesktopView} type="button">
            <Monitor size={17} />
            Switch to desktop site
          </button>
          <button className="danger" onClick={onLogout} type="button">
            <LogOut size={17} />
            Log out
          </button>
        </div>
        {buildVersion ? <p className="mobile-account-build">{buildVersion}</p> : null}
      </div>
    </div>
  );
}

function getInitial(displayName) {
  return (String(displayName || '').trim().charAt(0) || 'P').toUpperCase();
}
