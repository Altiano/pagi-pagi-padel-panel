import { useCallback } from 'react';
import { apiRequest } from '../api/client.js';
import { getPlaceholderStackItems, normalizePlaceholderBooking } from '../lib/bookings.js';
import { getSelectedCourtIds } from './forms.js';

export function usePlaceholderActions({
  canViewRevenue,
  courts,
  mitraId,
  onRefresh,
  placeholderEditor,
  setPlaceholderEditor,
  setPlaceholderStatus,
  setSelectedBooking,
}) {
  const savePlaceholder = useCallback(async (form) => {
    setPlaceholderStatus({ state: 'loading', message: 'Saving placeholder...' });
    const editingId = placeholderEditor.mode === 'edit' ? placeholderEditor.booking?.placeholder_id || placeholderEditor.booking?.id : null;
    const selectedCourtIds = getSelectedCourtIds(form);
    const formPayload = { ...form };
    delete formPayload.court_ids;
    delete formPayload.duration_mode;

    if (!selectedCourtIds.length) {
      throw new Error('Select at least one court.');
    }

    const buildPayload = (courtId) => {
      const court = courts.find((item) => item.id === courtId);
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
        onRefresh();
        if (saved?.data) setSelectedBooking(normalizePlaceholderBooking(saved.data));
        return;
      }

      const results = await Promise.allSettled(selectedCourtIds.map((courtId) => apiRequest('/api/placeholder-bookings', {
        method: 'POST',
        body: JSON.stringify(buildPayload(courtId)),
      })));
      const saved = results.filter((result) => result.status === 'fulfilled').map((result) => result.value);
      const failed = results.filter((result) => result.status === 'rejected');

      if (!saved.length) throw failed[0].reason;

      onRefresh();
      const firstSaved = saved.map((item) => item?.data).find(Boolean);
      if (firstSaved) setSelectedBooking(normalizePlaceholderBooking(firstSaved));

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
      setPlaceholderStatus({ state: 'error', message: error.message || 'Unable to save placeholder.' });
      throw error;
    }
  }, [
    canViewRevenue,
    courts,
    mitraId,
    onRefresh,
    placeholderEditor.booking?.id,
    placeholderEditor.booking?.placeholder_id,
    placeholderEditor.mode,
    setPlaceholderEditor,
    setPlaceholderStatus,
    setSelectedBooking,
  ]);

  const deletePlaceholder = useCallback(async (booking) => {
    const id = booking?.placeholder_id || booking?.id;
    if (!id) return;
    setPlaceholderStatus({ state: 'loading', message: 'Deleting placeholder...' });
    await apiRequest(`/api/placeholder-bookings/${id}`, { method: 'DELETE' });
    setPlaceholderStatus({ state: 'success', message: 'Placeholder deleted.' });
    setSelectedBooking(null);
    onRefresh();
  }, [onRefresh, setPlaceholderStatus, setSelectedBooking]);

  const deletePlaceholders = useCallback(async (bookings) => {
    // Each week-view card can stand in for a stack of placeholders sharing a slot,
    // so expand every selected card into its underlying placeholder ids.
    const ids = [...new Set(
      (bookings || [])
        .flatMap((booking) => getPlaceholderStackItems(booking))
        .map((item) => item?.placeholder_id || item?.id)
        .filter(Boolean),
    )];
    if (!ids.length) return;

    const label = `${ids.length} placeholder${ids.length > 1 ? 's' : ''}`;
    setPlaceholderStatus({ state: 'loading', message: `Deleting ${label}...` });
    const results = await Promise.allSettled(ids.map((id) => apiRequest(`/api/placeholder-bookings/${id}`, { method: 'DELETE' })));
    const failed = results.filter((result) => result.status === 'rejected');

    if (failed.length) {
      setPlaceholderStatus({
        state: 'error',
        message: `Deleted ${ids.length - failed.length} of ${ids.length} placeholders. ${failed.length} failed: ${failed[0].reason?.message || 'unknown error'}`,
      });
    } else {
      setPlaceholderStatus({ state: 'success', message: `${label} deleted.` });
    }

    setSelectedBooking(null);
    onRefresh();
  }, [onRefresh, setPlaceholderStatus, setSelectedBooking]);

  return {
    deletePlaceholder,
    deletePlaceholders,
    savePlaceholder,
  };
}
