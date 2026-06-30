import { useState } from 'react';
import { Upload, X } from 'lucide-react';
import { RECEIPT_ATTACHMENT_TYPE } from '../constants.js';
import { BookingActionSummary } from './BookingActionSummary.jsx';

export function PaymentProofDialog({ booking, isSaving, onClose, onSave }) {
  const [form, setForm] = useState(() => ({ attachmentType: RECEIPT_ATTACHMENT_TYPE, receiptFile: null }));
  const [error, setError] = useState('');

  function updateField(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');

    if (!booking?.trans_id) {
      setError('This booking does not have a transaction ID for attachment upload.');
      return;
    }
    if (!form.receiptFile) {
      setError('Select a transfer receipt first.');
      return;
    }

    try {
      await onSave(booking, form);
    } catch (saveError) {
      setError(saveError.message || 'Unable to upload receipt.');
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor compact-action-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">Payment proof</span>
          <button aria-label="Close payment proof panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>Upload receipt</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            <BookingActionSummary booking={booking} />
            <label>
              Attachment type
              <input onChange={(event) => updateField('attachmentType', event.target.value)} required value={form.attachmentType} />
            </label>
            <label>
              Transfer receipt
              <span className="receipt-upload-control">
                <Upload size={16} />
                <span>{form.receiptFile?.name || 'No file selected'}</span>
                <input
                  accept="image/*,.pdf"
                  onChange={(event) => updateField('receiptFile', event.target.files?.[0] || null)}
                  required
                  type="file"
                />
              </span>
            </label>
          </div>
          <div className="editor-footer">
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving || !form.receiptFile} type="submit">
                {isSaving ? 'Uploading...' : 'Upload receipt'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}
