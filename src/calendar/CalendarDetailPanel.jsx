// Right-hand detail panel: shows the selected booking/placeholder (with stack,
// waitlist, conflict info) and the day/week summary, plus action buttons.
import { CalendarDays, CheckCircle2, Copy, ExternalLink, Pencil, Plus, Trash2, Upload, X } from 'lucide-react';
import { formatLongDate, formatWeekRange } from '../lib/datetime.js';
import { copyText, formatMoney, formatStatus } from '../lib/format.js';
import {
  canDeletePlaceholder,
  getBookingConflictItems,
  getBookingTitle,
  getDurationMinutes,
  getPlaceholderStackItems,
  getSlotDraftFromBooking,
  getWaitlistItems,
  hasBookingConflict,
} from '../lib/bookings.js';

export function CalendarDetailPanel({
  booking,
  canViewRevenue = true,
  canWriteBookings = true,
  displayName = '',
  isVirtualUser = false,
  selectedDate,
  selectedDaySummary,
  view,
  weekSummary,
  onCancelBooking,
  onClose,
  onConvertPlaceholder,
  onCreatePlaceholder,
  onDeletePlaceholder,
  onEditBookingNotes,
  onEditPlaceholder,
  onMarkBookingPaid,
  onOpenDay,
  onRescheduleBooking,
  onUploadPaymentProof,
}) {
  const canDelete = (item) => canDeletePlaceholder(item, { displayName, isVirtualUser });
  if (booking) {
    const isPlaceholder = booking.is_placeholder;
    const conflictItems = getBookingConflictItems(booking);
    const placeholderStack = getPlaceholderStackItems(booking);
    const waitlistItems = getWaitlistItems(booking);
    const hasPlaceholderStack = placeholderStack.length > 1;
    const canConvertPlaceholder = canWriteBookings && isPlaceholder && !hasBookingConflict(booking);
    return (
      <aside className="calendar-detail">
        <div className="panel-label-row">
          <span className="panel-label">{isPlaceholder ? hasPlaceholderStack ? 'Placeholder stack' : 'Placeholder booking' : 'Booking detail'}</span>
          {onClose ? (
            <button aria-label="Close booking detail" onClick={onClose} type="button">
              <X size={16} />
            </button>
          ) : null}
        </div>
        <h2>{getBookingTitle(booking)}</h2>
        {isPlaceholder && conflictItems.length ? (
          <div className="detail-conflict-alert">
            <strong>Blocked by live booking</strong>
            {conflictItems.slice(0, 3).map((item) => (
              <span key={`${item.type}-${item.id}-${item.time}`}>
                {item.name} · {item.court} · {item.time}
              </span>
            ))}
          </div>
        ) : null}
        {!isPlaceholder && waitlistItems.length ? (
          <div className="detail-conflict-alert waitlist">
            <strong>{waitlistItems.length} waitlist placeholder{waitlistItems.length > 1 ? 's' : ''}</strong>
            {waitlistItems.slice(0, 4).map((item) => (
              <div className="detail-conflict-row" key={`${item.type}-${item.id}-${item.time}`}>
                <span>{item.name} · {item.time}</span>
                {canWriteBookings && canDelete(item) ? (
                  <button className="danger-action" onClick={() => onDeletePlaceholder?.(item)} type="button"><Trash2 size={13} /> Delete</button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        {hasPlaceholderStack ? (
          <div className="detail-stack-list">
            <strong>Placeholder candidates</strong>
            {placeholderStack.map((item) => (
              <div key={item.placeholder_id || item.id}>
                <span>
                  <b>{item.booking_owner || item.name}</b>
                  <small>{formatStatus(item.status)} · {item.customer_contact || 'No contact'}</small>
                </span>
                <button onClick={() => onEditPlaceholder?.(item)} type="button"><Pencil size={14} /> Edit</button>
                {canDelete(item) ? (
                  <button className="danger-action" onClick={() => onDeletePlaceholder?.(item)} type="button"><Trash2 size={14} /> Delete</button>
                ) : null}
              </div>
            ))}
          </div>
        ) : null}
        <dl>
          <div><dt>Court</dt><dd>{booking.court_name || booking.court_id}</dd></div>
          {isPlaceholder ? <div><dt>Date</dt><dd>{formatLongDate(booking.date)}</dd></div> : null}
          <div><dt>Time</dt><dd>{booking.time}</dd></div>
          <div><dt>Duration</dt><dd>{booking.duration || getDurationMinutes(booking)} min</dd></div>
          <div><dt>Type</dt><dd>{isPlaceholder ? booking.is_waitlist ? 'Waitlist placeholder' : hasPlaceholderStack ? 'Placeholder stack' : 'Local placeholder' : booking.booking_type || booking.type}</dd></div>
          <div><dt>Payment</dt><dd>{isPlaceholder ? formatStatus(booking.status) : booking.booking_paid ? 'Paid' : 'Unpaid'}</dd></div>
          <div><dt>Price</dt><dd>{formatMoney(booking.price, canViewRevenue)}</dd></div>
          {isPlaceholder ? <div><dt>Contact</dt><dd>{booking.customer_contact || '-'}</dd></div> : null}
          <div><dt>Notes</dt><dd>{booking.notes || 'No notes'}</dd></div>
          {isPlaceholder ? (
            <>
              <div><dt>Created by</dt><dd>{booking.created_by_name || '-'}</dd></div>
              <div><dt>Updated by</dt><dd>{booking.updated_by_name || '-'}</dd></div>
            </>
          ) : (
            <div><dt>Transaction ID</dt><dd>{booking.trans_id || '-'}</dd></div>
          )}
        </dl>
        {isPlaceholder ? (
          <div className="detail-actions">
            {canWriteBookings ? (
              <button className="primary-detail-action" disabled={!canConvertPlaceholder} onClick={() => onConvertPlaceholder?.(booking)} type="button">
                <CheckCircle2 size={15} /> Convert to booking
              </button>
            ) : null}
            <button onClick={() => onCreatePlaceholder?.(getSlotDraftFromBooking(booking, selectedDate))} type="button"><Plus size={15} /> Add another placeholder</button>
            <button onClick={() => onEditPlaceholder?.(booking)} type="button"><Pencil size={15} /> Edit placeholder</button>
            {canDelete(booking) ? (
              <button className="danger-action" onClick={() => onDeletePlaceholder?.(booking)} type="button"><Trash2 size={15} /> Delete</button>
            ) : null}
            {canWriteBookings && hasBookingConflict(booking) ? <p className="detail-action-note danger">A live booking already owns this slot. Move or cancel that booking before converting this placeholder.</p> : null}
          </div>
        ) : canWriteBookings ? (
          <div className="detail-actions">
            {!booking.booking_paid ? (
              <button className="primary-detail-action" onClick={() => onMarkBookingPaid?.(booking)} type="button">
                <CheckCircle2 size={15} /> Mark paid
              </button>
            ) : null}
            <button onClick={() => onCreatePlaceholder?.(getSlotDraftFromBooking(booking, selectedDate))} type="button"><Plus size={15} /> Add waitlist placeholder</button>
            <button onClick={() => onUploadPaymentProof?.(booking)} type="button"><Upload size={15} /> Upload receipt</button>
            <button onClick={() => onRescheduleBooking?.(booking)} type="button"><CalendarDays size={15} /> Reschedule</button>
            <button onClick={() => onEditBookingNotes?.(booking)} type="button"><Pencil size={15} /> Edit notes</button>
            <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
            <button className="danger-action" onClick={() => onCancelBooking?.(booking)} type="button"><Trash2 size={15} /> Cancel booking</button>
          </div>
        ) : (
          <div className="detail-actions">
            <button onClick={() => copyText(booking.trans_id)} type="button"><Copy size={15} /> Copy ID</button>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside className="calendar-detail">
      <div className="panel-label-row">
        <span className="panel-label">{view === 'week' ? 'Week summary' : 'Day summary'}</span>
        {onClose ? (
          <button aria-label="Close summary" onClick={onClose} type="button">
            <X size={16} />
          </button>
        ) : null}
      </div>
      <h2>{view === 'week' ? formatWeekRange(selectedDate) : formatLongDate(selectedDate)}</h2>
      <dl>
        <div><dt>Total bookings</dt><dd>{view === 'week' ? weekSummary.totalBookings : selectedDaySummary.bookingCount}</dd></div>
        <div><dt>Booked hours</dt><dd>{(view === 'week' ? weekSummary.bookedHours : selectedDaySummary.bookedHours).toFixed(1)}h</dd></div>
        <div><dt>Estimated revenue</dt><dd>{formatMoney(view === 'week' ? weekSummary.revenue : selectedDaySummary.revenue, canViewRevenue)}</dd></div>
        <div><dt>Busiest day</dt><dd>{weekSummary.busiestDay || 'No bookings'}</dd></div>
        <div><dt>Busiest band</dt><dd>{weekSummary.busiestBand || 'No bookings'}</dd></div>
      </dl>
      <div className="detail-actions">
        <button onClick={onOpenDay} type="button"><CalendarDays size={15} /> Open day view</button>
        <button type="button"><ExternalLink size={15} /> Export week</button>
      </div>
    </aside>
  );
}


