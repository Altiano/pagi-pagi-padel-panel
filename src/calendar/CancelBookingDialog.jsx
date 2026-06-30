import { useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { BookingActionSummary } from './BookingActionSummary.jsx';

export function CancelBookingDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ cancel_note: 'Cancel' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to cancel booking.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Cancel booking</span>
          <button aria-label="Close cancel booking panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Cancel booking</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <div className="conversion-warning danger">
              <AlertTriangle size={16} />
              <span>This booking will be removed from the upstream schedule.</span>
            </div>
            <label>
              Cancel note
              <textarea
                onChange={(event) => setForm({ cancel_note: event.target.value })}
                rows={4}
                value={form.cancel_note}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Keep booking</button>
              <button className="primary-button danger-button" disabled={isSaving} type="submit">
                {isSaving ? 'Canceling...' : 'Cancel booking'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
