import { formatLongDate } from '../lib/datetime.js';
import { getStartLabel } from '../lib/bookings.js';

export function BookingActionSummary({ booking }) {
  return (
    <div className="conversion-summary">
      <span>{booking?.court_name || booking?.court_id || 'Court'}</span>
      <strong>{booking?.booking_owner || booking?.name || 'Booking'} - {booking?.time || getStartLabel(booking)}</strong>
      <small>{booking?.date ? `${formatLongDate(booking.date)} - ` : ''}{booking?.trans_id || booking?.id || '-'}</small>
    </div>
  );
}
