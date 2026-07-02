// Calendar grid renderers (desktop day/week, mobile agenda/week) plus the
// hover tooltip. These are presentational: they receive bookings + callbacks.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ChevronRight, Plus } from 'lucide-react';
import {
  buildHours,
  buildSlotMinutes,
  formatCompactDate,
  formatCompactTime,
  formatDayNumber,
  formatLongDate,
  formatTimeInput,
  formatWeekday,
  getCurrentMinutes,
  isTodayDate,
  parseTimeToMinutes,
  shiftTime,
} from '../lib/datetime.js';
import { formatMoney } from '../lib/format.js';
import {
  bookingsOverlap,
  buildCalendarDisplayBookings,
  buildCourtTimelineEntries,
  getBookingEndMinutes,
  getBookingMeta,
  getBookingPillLabel,
  getBookingPosition,
  getBookingStartMinutes,
  getBookingTitle,
  getBookingTone,
  getCompactStartLabel,
  getPlaceholderStackItems,
  getStartLabel,
  getWaitlistItems,
  summarizeDay,
} from '../lib/bookings.js';

export function MobileDayAgenda({ bookings, canViewRevenue = true, courtFilter = 'all', courts, openHour, selectedBooking, selectedDate, onSelectBooking, onSelectFreeSlot }) {
  const isToday = isTodayDate(selectedDate);
  const [nowMinutes, setNowMinutes] = useState(getCurrentMinutes);

  // Keep the "now" line honest while the app sits open on today.
  useEffect(() => {
    if (!isToday) return undefined;
    setNowMinutes(getCurrentMinutes());
    const timer = setInterval(() => setNowMinutes(getCurrentMinutes()), 60 * 1000);
    return () => clearInterval(timer);
  }, [isToday]);

  const visibleCourts = courts.filter((court) => courtFilter === 'all' || court.id === courtFilter);
  const courtSections = (visibleCourts.length ? visibleCourts : [{ id: 'all', name: 'All courts' }]).map((court) => ({
    court,
    entries: buildCourtTimelineEntries(
      buildCalendarDisplayBookings(court.id === 'all' ? bookings : bookings.filter((booking) => booking.court_id === court.id)),
      openHour,
    ),
  }));

  const openMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const closeMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const showNowLine = isToday && nowMinutes >= openMinutes && nowMinutes <= closeMinutes;

  return (
    <div className="mobile-agenda">
      {courtSections.map(({ court, entries }) => {
        const bookingCount = entries.filter((entry) => entry.type === 'booking').length;
        const nowLineIndex = showNowLine && entries.length
          ? (() => {
            const index = entries.findIndex((entry) => getEntryStartMinutes(entry) > nowMinutes);
            return index === -1 ? entries.length : index;
          })()
          : -1;

        return (
          <section className="mobile-court-section" key={court.id}>
            <header className="mobile-court-heading">
              <strong>{court.name}</strong>
              <span>{bookingCount ? `${bookingCount} booking${bookingCount === 1 ? '' : 's'}` : 'No bookings'}</span>
            </header>

            <div className="mobile-agenda-list">
              {entries.length ? entries.flatMap((entry, index) => {
                const rows = [];
                if (index === nowLineIndex) rows.push(<MobileNowLine key={`now-${court.id}`} nowMinutes={nowMinutes} />);
                rows.push(entry.type === 'availability' ? (
                  <button
                    aria-label={`Create booking for ${court.name} at ${formatTimeInput(entry.startMinutes)}`}
                    className="mobile-availability-row"
                    key={entry.id}
                    onClick={() => onSelectFreeSlot?.({
                      court_id: court.id,
                      court_name: court.name,
                      date: selectedDate,
                      start_time: formatTimeInput(entry.startMinutes),
                      end_time: formatTimeInput(Math.min(entry.startMinutes + 60, entry.endMinutes)),
                    })}
                    type="button"
                  >
                    <span className="mobile-booking-time"><b>{formatTimeInput(entry.startMinutes)}</b></span>
                    <span aria-hidden="true" className="mobile-booking-accent free" />
                    <span className="mobile-availability-main">
                      <strong>Available</strong>
                      <small>until {formatCompactTime(entry.endMinutes)}</small>
                    </span>
                    <span aria-hidden="true" className="mobile-availability-add"><Plus size={15} /></span>
                  </button>
                ) : (
                  <button
                    className={`mobile-booking-row ${getBookingTone(entry.booking)} ${selectedBooking?.id === entry.booking.id ? 'selected' : ''}`}
                    key={entry.booking.id}
                    onClick={() => onSelectBooking(entry.booking)}
                    type="button"
                  >
                    <span className="mobile-booking-time">
                      <b>{getStartLabel(entry.booking)}</b>
                      <small>{getMobileEndLabel(entry.booking)}</small>
                    </span>
                    <span aria-hidden="true" className="mobile-booking-accent" />
                    <span className="mobile-booking-main">
                      <strong>{getBookingTitle(entry.booking)}</strong>
                      <small>{getBookingMeta(entry.booking, canViewRevenue)}</small>
                    </span>
                    <span className={`mobile-booking-tag ${!entry.booking.is_placeholder && !entry.booking.booking_paid ? 'unpaid' : ''}`}>
                      {getBookingPillLabel(entry.booking) || (entry.booking.is_placeholder ? 'Hold' : entry.booking.booking_paid ? 'Paid' : 'Unpaid')}
                    </span>
                  </button>
                ));
                if (index === entries.length - 1 && nowLineIndex === entries.length) {
                  rows.push(<MobileNowLine key={`now-${court.id}`} nowMinutes={nowMinutes} />);
                }
                return rows;
              }) : (
                <button
                  aria-label={`Create booking for ${court.name}`}
                  className="mobile-availability-row"
                  onClick={() => onSelectFreeSlot?.({
                    court_id: court.id,
                    court_name: court.name,
                    date: selectedDate,
                    start_time: openHour?.open_hours || '06:00',
                    end_time: shiftTime(openHour?.open_hours || '06:00', 60),
                  })}
                  type="button"
                >
                  <span className="mobile-booking-time"><b>{openHour?.open_hours || '06:00'}</b></span>
                  <span aria-hidden="true" className="mobile-booking-accent free" />
                  <span className="mobile-availability-main">
                    <strong>All day available</strong>
                    <small>until {formatCompactTime(closeMinutes)}</small>
                  </span>
                  <span aria-hidden="true" className="mobile-availability-add"><Plus size={15} /></span>
                </button>
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function MobileNowLine({ nowMinutes }) {
  return (
    <div aria-hidden="true" className="mobile-now-line">
      <span>{formatCompactTime(nowMinutes)}</span>
    </div>
  );
}

function getEntryStartMinutes(entry) {
  return entry.type === 'availability' ? entry.startMinutes : getBookingStartMinutes(entry.booking);
}

function getMobileEndLabel(booking) {
  const [, end] = String(booking?.time || '').split('-');
  return end || formatTimeInput(getBookingEndMinutes(booking));
}

export function MobileWeekCalendar({ bookingsByDate, canViewRevenue = true, courts, openHour, selectedDate, weekDays, onSelectBooking, onSelectDate, onSelectFreeSlot, onSwitchDay }) {
  return (
    <div className="mobile-week-list">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        const summary = summarizeDay(bookings, openHour, courts.length, canViewRevenue);
        return (
          <article className={`mobile-week-row ${date === selectedDate ? 'selected' : ''}`} key={date}>
            <button className="mobile-week-summary" onClick={() => onSelectDate(date)} type="button">
              <span>
                <strong>{formatWeekday(date)}</strong>
                <small>{formatDayNumber(date)}</small>
              </span>
              <span className="mobile-week-stats">
                <strong>{bookings.length} bookings</strong>
                <small>{summary.bookedHours.toFixed(1)}h · {formatMoney(summary.revenue, canViewRevenue)}</small>
              </span>
              <span className="occupancy-bar">
                <span style={{ width: `${summary.occupancy}%` }} />
              </span>
            </button>

            {date === selectedDate ? (
              <div className="mobile-week-detail">
                {courts.slice(0, 4).map((court) => {
                  const courtBookings = buildCalendarDisplayBookings(bookings.filter((booking) => booking.court_id === court.id));
                  return (
                    <div className="mobile-week-court" key={court.id}>
                      <span>{court.name}</span>
                      {courtBookings.length ? courtBookings.slice(0, 2).map((booking) => (
                        <button className={getBookingTone(booking)} key={booking.id} onClick={() => onSelectBooking(booking)} type="button">
                          <strong>{getCompactStartLabel(booking)}</strong>
                          <span>{getBookingTitle(booking)}</span>
                        </button>
                      )) : (
                        <button
                          className="mobile-week-availability"
                          onClick={() => onSelectFreeSlot?.({
                            court_id: court.id,
                            court_name: court.name,
                            date,
                            start_time: openHour?.open_hours || '06:00',
                            end_time: shiftTime(openHour?.open_hours || '06:00', 60),
                          })}
                          type="button"
                        >
                          <strong>{formatCompactTime(parseTimeToMinutes(openHour?.open_hours || '06:00'))}</strong>
                          <span>Available</span>
                        </button>
                      )}
                    </div>
                  );
                })}
                <button className="open-day-link" onClick={onSwitchDay} type="button">Open day view</button>
              </div>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}

export function DayCalendar({ bookings, canViewRevenue = true, courts, openHour, selectedBooking, selectedDate, onSelectBooking, onSelectFreeSlot }) {
  const hours = buildHours(openHour);
  const intervalCount = Math.max(hours.length - 1, 1);
  const startMinutes = parseTimeToMinutes(openHour?.open_hours || '06:00');
  const endMinutes = parseTimeToMinutes(openHour?.close_hours || '24:00');
  const totalMinutes = Math.max(endMinutes - startMinutes, 60);
  const slotMinutes = buildSlotMinutes(startMinutes, endMinutes);

  return (
    <div className="day-calendar">
      <div className="day-calendar-header">
        <div>
          <span>{formatCompactDate(selectedDate)}</span>
          <strong>{bookings.length} bookings</strong>
        </div>
        {courts.map((court) => <div key={court.id}>{court.name}</div>)}
      </div>
      <div
        className="day-calendar-grid"
        style={{ '--court-count': courts.length || 1, '--time-slot-count': intervalCount }}
      >
        <div className="time-axis">
          {hours.map((hour, index) => (
            <span key={hour} style={{ top: `${(index / intervalCount) * 100}%` }}>{hour}</span>
          ))}
        </div>
        {courts.map((court) => (
          <div className="court-lane" key={court.id}>
            {hours.slice(0, -1).map((hour) => <span className="hour-line" key={hour} />)}
            {slotMinutes.map((minutes) => {
              const slotBooking = {
                court_id: court.id,
                  time: `${formatTimeInput(minutes)}-${formatTimeInput(Math.min(minutes + 60, endMinutes))}`,
              };
              const isAvailable = !bookings.some((booking) => booking.court_id === court.id && bookingsOverlap(slotBooking, booking));
              if (!isAvailable) return null;
              return (
                <button
                  aria-label={`Create booking for ${court.name} at ${formatTimeInput(minutes)}`}
                  className="day-slot-button"
                  key={`${court.id}-${minutes}`}
                  onClick={() => onSelectFreeSlot?.({
                    court_id: court.id,
                    court_name: court.name,
                    date: selectedDate,
                    start_time: formatTimeInput(minutes),
                    end_time: formatTimeInput(Math.min(minutes + 60, endMinutes)),
                  })}
                  style={{
                    top: `${((minutes - startMinutes) / totalMinutes) * 100}%`,
                    height: `${(60 / totalMinutes) * 100}%`,
                  }}
                  title={`Create booking at ${formatTimeInput(minutes)}`}
                  type="button"
                >
                  <span>+</span>
                </button>
              );
            })}
            {buildCalendarDisplayBookings(bookings.filter((booking) => booking.court_id === court.id)).map((booking) => {
              const position = getBookingPosition(booking, startMinutes, totalMinutes);
              return (
                <CalendarBookingButton
                  booking={booking}
                  canViewRevenue={canViewRevenue}
                  className={`booking-block ${getBookingTone(booking)} ${selectedBooking?.id === booking.id ? 'selected' : ''}`}
                  courtName={court.name}
                  date={selectedDate}
                  key={booking.id}
                  onClick={() => onSelectBooking(booking)}
                  style={{ top: `${position.top}%`, height: `${position.height}%` }}
                >
                  <strong>{getBookingTitle(booking)}</strong>
                  <span>{booking.time}</span>
                  <small>{getBookingMeta(booking, canViewRevenue)}</small>
                  {getBookingPillLabel(booking) ? (
                    <em className={booking.is_waitlist ? 'waitlist-pill' : ''}>{getBookingPillLabel(booking)}</em>
                  ) : null}
                </CalendarBookingButton>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function WeekCalendar({ bookingsByDate, canViewRevenue = true, courts, openHour, selectedDate, selectedPlaceholderIds, weekDays, onSelectBooking, onSelectDate, onSelectFreeSlot, onSwitchDay }) {
  return (
    <div className="week-calendar">
      {weekDays.map((date) => {
        const bookings = bookingsByDate[date] || [];
        return (
          <WeekDayColumn
            bookings={bookings}
            canViewRevenue={canViewRevenue}
            courts={courts}
            date={date}
            isSelected={date === selectedDate}
            key={date}
            openHour={openHour}
            selectedPlaceholderIds={selectedPlaceholderIds}
            onSelectBooking={onSelectBooking}
            onSelectDate={onSelectDate}
            onSelectFreeSlot={onSelectFreeSlot}
            onSwitchDay={onSwitchDay}
          />
        );
      })}
    </div>
  );
}

export function WeekDayColumn({ bookings, canViewRevenue = true, courts, date, isSelected, openHour, selectedPlaceholderIds, onSelectBooking, onSelectDate, onSelectFreeSlot, onSwitchDay }) {
  const [hiddenCounts, setHiddenCounts] = useState({ above: 0, below: 0 });
  const courtListRef = useRef(null);
  const summary = summarizeDay(bookings, openHour, courts.length, canViewRevenue);
  const bookingLabel = `${bookings.length} booking${bookings.length === 1 ? '' : 's'}`;

  useEffect(() => {
    const list = courtListRef.current;
    if (!list) return undefined;

    const updateHiddenBookings = () => {
      const listRect = list.getBoundingClientRect();
      const bookingButtons = Array.from(list.querySelectorAll('.week-booking-card'));
      const above = bookingButtons.filter((button) => button.getBoundingClientRect().bottom < listRect.top + 8);
      const below = bookingButtons.filter((button) => button.getBoundingClientRect().top > listRect.bottom - 8);
      setHiddenCounts({ above: above.length, below: below.length });
    };

    updateHiddenBookings();
    list.addEventListener('scroll', updateHiddenBookings, { passive: true });
    window.addEventListener('resize', updateHiddenBookings);

    return () => {
      list.removeEventListener('scroll', updateHiddenBookings);
      window.removeEventListener('resize', updateHiddenBookings);
    };
  }, [bookings, courts, openHour]);

  return (
    <article className={`week-day ${isSelected ? 'selected' : ''}`}>
      <button className="week-day-header" onClick={() => {
        onSelectDate(date);
        onSwitchDay();
      }} type="button">
        <span>{formatWeekday(date)}</span>
        <strong>{formatDayNumber(date)}</strong>
        <small>{bookingLabel}</small>
        <div className="occupancy-bar">
          <span style={{ width: `${summary.occupancy}%` }} />
        </div>
      </button>
      <div className="week-day-metrics">
        <span>{summary.bookedHours.toFixed(1)}h booked</span>
        <em>{formatMoney(summary.revenue, canViewRevenue)}</em>
      </div>
      <div className="week-day-body">
        <div className="week-court-list" ref={courtListRef}>
          {courts.map((court) => {
            const courtBookings = bookings.filter((booking) => booking.court_id === court.id);
            const timelineEntries = buildCourtTimelineEntries(buildCalendarDisplayBookings(courtBookings), openHour);
            return (
              <div className="week-court" key={court.id}>
                <p>{court.name}</p>
                {timelineEntries.length ? timelineEntries.map((entry) => (
                  entry.type === 'availability' ? (
                    <button
                      aria-label={`Create booking for ${court.name} on ${formatLongDate(date)} at ${formatTimeInput(entry.startMinutes)}`}
                      className="availability-gap"
                      key={entry.id}
                      onClick={() => onSelectFreeSlot?.({
                        court_id: court.id,
                        court_name: court.name,
                        date,
                        start_time: formatTimeInput(entry.startMinutes),
                        end_time: formatTimeInput(Math.min(entry.startMinutes + 60, entry.endMinutes)),
                      })}
                      type="button"
                    >
                      <strong>{entry.label}</strong>
                    </button>
                  ) : (
                    <CalendarBookingButton booking={entry.booking} canViewRevenue={canViewRevenue} className={`week-booking-card ${getBookingTone(entry.booking)} ${selectedPlaceholderIds?.includes(entry.booking.id) ? 'multi-selected' : ''}`} courtName={court.name} date={date} key={entry.booking.id} onClick={(event) => onSelectBooking(entry.booking, event)}>
                      <span>{getCompactStartLabel(entry.booking)}</span>
                      <strong>{getBookingTitle(entry.booking)}</strong>
                      {getBookingPillLabel(entry.booking) ? (
                        <small className={entry.booking.is_waitlist ? 'waitlist-pill' : ''}>{getBookingPillLabel(entry.booking)}</small>
                      ) : null}
                    </CalendarBookingButton>
                  )
                )) : <span className="empty-slot">Available</span>}
              </div>
            );
          })}
        </div>
        {hiddenCounts.above > 0 ? (
          <div className="week-scroll-more-indicator above">
            <span>{hiddenCounts.above} hidden above</span>
            <ChevronRight size={14} />
          </div>
        ) : null}
        {hiddenCounts.below > 0 ? (
          <div className="week-scroll-more-indicator below">
            <span>{hiddenCounts.below} hidden below</span>
            <ChevronRight size={14} />
          </div>
        ) : null}
      </div>
    </article>
  );
}

export function CalendarBookingButton({ booking, canViewRevenue = true, className, courtName, date, onClick, style, children }) {
  const anchorRef = useRef(null);
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={className}
        onBlur={() => setOpen(false)}
        onClick={onClick}
        onFocus={() => setOpen(true)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        ref={anchorRef}
        style={style}
        type="button"
      >
        {children}
      </button>
      {open ? (
        <CalendarCardTooltip
          anchorRef={anchorRef}
          booking={booking}
          canViewRevenue={canViewRevenue}
          courtName={courtName}
          date={date}
        />
      ) : null}
    </>
  );
}

export function CalendarCardTooltip({ anchorRef, booking, canViewRevenue = true, courtName, date }) {
  const tooltipRef = useRef(null);
  const [position, setPosition] = useState({ left: 0, top: 0, ready: false });

  useLayoutEffect(() => {
    const updatePosition = () => {
      const anchor = anchorRef.current;
      const tooltip = tooltipRef.current;
      if (!anchor || !tooltip) return;
      const anchorRect = anchor.getBoundingClientRect();
      const tooltipRect = tooltip.getBoundingClientRect();
      const gap = 10;
      const margin = 8;

      let left = anchorRect.right + gap;
      if (left + tooltipRect.width > window.innerWidth - margin) {
        left = anchorRect.left - gap - tooltipRect.width;
      }
      left = Math.max(margin, Math.min(left, window.innerWidth - margin - tooltipRect.width));

      let top = anchorRect.top;
      top = Math.max(margin, Math.min(top, window.innerHeight - margin - tooltipRect.height));

      setPosition({ left, top, ready: true });
    };

    updatePosition();
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
    };
  }, [anchorRef, booking, courtName, date]);

  const waitlistItems = getWaitlistItems(booking);
  const stackItems = booking?.is_placeholder && booking.stack_count > 1 ? getPlaceholderStackItems(booking) : [];
  const stackNames = stackItems.map((item) => item.booking_owner || item.name).filter(Boolean);

  return createPortal(
    <div
      className="card-tooltip"
      ref={tooltipRef}
      role="tooltip"
      style={{ left: position.left, top: position.top, visibility: position.ready ? 'visible' : 'hidden' }}
    >
      <strong className="card-tooltip-title">{getBookingTitle(booking)}</strong>
      <span className="card-tooltip-meta">{getBookingMeta(booking, canViewRevenue)}</span>
      <dl className="card-tooltip-rows">
        <div><dt>When</dt><dd>{formatLongDate(date)}</dd></div>
        <div><dt>Time</dt><dd>{formatBookingTimeRange(booking)}</dd></div>
        <div><dt>Court</dt><dd>{courtName || booking.court_name || '—'}</dd></div>
        {stackNames.length ? (
          <div><dt>Holds</dt><dd>{stackNames.join(', ')}</dd></div>
        ) : null}
        {waitlistItems.length ? (
          <div><dt>Waitlist</dt><dd>{waitlistItems.length} placeholder{waitlistItems.length > 1 ? 's' : ''}</dd></div>
        ) : null}
        {booking?.notes ? (
          <div><dt>Notes</dt><dd>{booking.notes}</dd></div>
        ) : null}
      </dl>
    </div>,
    document.body,
  );
}

export function formatBookingTimeRange(booking) {
  const start = getBookingStartMinutes(booking);
  const end = getBookingEndMinutes(booking);
  if (Number.isNaN(start) || Number.isNaN(end)) return booking?.time || '—';
  return `${formatCompactTime(start)} – ${formatCompactTime(end)}`;
}


