import { useState } from 'react';
import { X } from 'lucide-react';
import { BookingActionSummary } from './BookingActionSummary.jsx';

export function BookingNotesDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ notes: booking?.notes || '' }));
  const [error, setError] = useState('');

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to save notes.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Booking notes</span>
          <button aria-label="Close notes panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Edit notes</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Notes
              <textarea
                onChange={(event) => setForm({ notes: event.target.value })}
                rows={6}
                value={form.notes}
              />
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : 'Save notes'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
