import { useCallback } from 'react';
import { apiRequest } from '../api/client.js';
import { fetchBookingDetailForAction, uploadBookingReceipt } from '../api/calendar.js';
import { getCourtBookingWriteType } from '../lib/bookings.js';
import { formatLongDate, formatUpstreamTime } from '../lib/datetime.js';
import {
  buildCancelBookingPayload,
  buildCourtBookingPayload,
  getBookingFormDates,
  getSelectedCourtIds,
  getTimeRangeDurationMinutes,
} from './forms.js';

const bookingWritePermissionMessage = 'This virtual user needs Calendar booking permission to write real bookings.';

export function useRealBookingActions({
  canWriteBookings,
  courts,
  mitraId,
  onRefresh,
  setBookingActionEditor,
  setPlaceholderStatus,
  setSelectedBooking,
}) {
  const requireWriteAccess = useCallback(() => {
    if (!canWriteBookings) throw new Error(bookingWritePermissionMessage);
  }, [canWriteBookings]);

  const saveRealBooking = useCallback(async (booking, form) => {
    requireWriteAccess();
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
            const court = courts.find((item) => item.id === createdBooking.courtId);
            warnings.push(`Receipt was not uploaded for ${court?.name ? `${court.name} on ` : ''}${formatLongDate(createdBooking.date)} because the booking response did not include a transaction ID.`);
          } else {
            try {
              await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: createdBooking.transId });
            } catch (uploadError) {
              const court = courts.find((item) => item.id === createdBooking.courtId);
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
      onRefresh();
    } catch (convertError) {
      const partialMessage = createdBookings.length
        ? `${createdBookings.length} of ${bulkCount} bookings were created before ${formatLongDate(currentDate)} failed. `
        : '';
      const message = `${partialMessage}${convertError.message || 'Unable to save booking.'}`;
      setPlaceholderStatus({ state: 'error', message });
      if (createdBookings.length) onRefresh();
      throw new Error(message, { cause: convertError });
    }
  }, [courts, mitraId, onRefresh, requireWriteAccess, setBookingActionEditor, setPlaceholderStatus, setSelectedBooking]);

  const markBookingPaid = useCallback(async (booking) => {
    requireWriteAccess();
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
      onRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to mark booking paid.' });
      throw error;
    }
  }, [mitraId, onRefresh, requireWriteAccess, setPlaceholderStatus]);

  const savePaymentProof = useCallback(async (booking, form) => {
    requireWriteAccess();
    if (!booking?.trans_id) throw new Error('This booking does not have a transaction ID for attachment upload.');
    if (!form.receiptFile) throw new Error('Select a transfer receipt first.');
    setPlaceholderStatus({ state: 'loading', message: 'Uploading receipt...' });
    try {
      await uploadBookingReceipt({ attachmentType: form.attachmentType, file: form.receiptFile, transId: booking.trans_id });
      setBookingActionEditor({ mode: 'closed', booking: null, draft: null });
      setPlaceholderStatus({ state: 'success', message: 'Receipt uploaded.' });
      onRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to upload receipt.' });
      throw error;
    }
  }, [onRefresh, requireWriteAccess, setBookingActionEditor, setPlaceholderStatus]);

  const rescheduleBooking = useCallback(async (booking, form) => {
    requireWriteAccess();
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
      onRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to reschedule booking.' });
      throw error;
    }
  }, [mitraId, onRefresh, requireWriteAccess, setBookingActionEditor, setPlaceholderStatus, setSelectedBooking]);

  const cancelBooking = useCallback(async (booking, form) => {
    requireWriteAccess();
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
      onRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to cancel booking.' });
      throw error;
    }
  }, [mitraId, onRefresh, requireWriteAccess, setBookingActionEditor, setPlaceholderStatus, setSelectedBooking]);

  const saveBookingNotes = useCallback(async (booking, form) => {
    requireWriteAccess();
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
      onRefresh();
    } catch (error) {
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save notes.' });
      throw error;
    }
  }, [mitraId, onRefresh, requireWriteAccess, setBookingActionEditor, setPlaceholderStatus]);

  return {
    cancelBooking,
    markBookingPaid,
    rescheduleBooking,
    saveBookingNotes,
    savePaymentProof,
    saveRealBooking,
  };
}
