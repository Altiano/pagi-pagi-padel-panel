import { useState } from 'react';
import { X } from 'lucide-react';
import { PLACEHOLDER_DURATION_OPTIONS, PLACEHOLDER_STATUSES } from '../constants.js';
import { parseTimeToMinutes } from '../lib/datetime.js';
import { formatMoneyInput, parseMoneyInput } from '../lib/format.js';
import {
  buildPlaceholderForm,
  formatConflictError,
  getPlaceholderDurationMinutes,
  getSelectedCourtIds,
  inferPlaceholderDurationMode,
  shiftFormEndTime,
} from './forms.js';

export function PlaceholderBookingEditor({ booking, canViewRevenue = true, conflicts, courts, defaultDate, defaultName, draft, isSaving, isVirtualUser = false, mode, openHour, onClose, onSave }) {
  const [form, setForm] = useState(() => buildPlaceholderForm({ booking, courts, defaultDate, defaultName, draft, isVirtualUser, openHour }));
  const [error, setError] = useState('');
  const overlapList = conflicts(form);
  const liveOverlapCount = overlapList.filter((item) => !item.is_placeholder).length;
  const placeholderOverlapCount = overlapList.filter((item) => item.is_placeholder).length;
  const selectedCourtIds = getSelectedCourtIds(form);

  function updateField(field, value) {
    setForm((current) => {
      if (field === 'start_time') {
        const durationMinutes = getPlaceholderDurationMinutes(current);
        return { ...current, start_time: value, end_time: shiftFormEndTime(value, durationMinutes) };
      }
      if (field === 'end_time') {
        return { ...current, end_time: value, duration_mode: inferPlaceholderDurationMode(current.start_time, value) };
      }
      if (field === 'court_id') {
        return { ...current, court_id: value, court_ids: value ? [value] : [] };
      }
      return { ...current, [field]: value };
    });
  }

  function toggleCourt(courtId) {
    setForm((current) => {
      const courtIds = new Set(getSelectedCourtIds(current));
      if (courtIds.has(courtId)) {
        courtIds.delete(courtId);
      } else {
        courtIds.add(courtId);
      }
      const nextCourtIds = [...courtIds];
      return {
        ...current,
        court_id: nextCourtIds[0] || '',
        court_ids: nextCourtIds,
      };
    });
  }

  function setDuration(minutes) {
    setForm((current) => ({
      ...current,
      duration_mode: String(minutes),
      end_time: shiftFormEndTime(current.start_time, minutes),
    }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    if (!selectedCourtIds.length) {
      setError('Select at least one court.');
      return;
    }
    if (parseTimeToMinutes(form.end_time) <= parseTimeToMinutes(form.start_time)) {
      setError('End time must be after start time.');
      return;
    }
    try {
      await onSave(form);
    } catch (saveError) {
      setError(formatConflictError(saveError));
    }
  }

  return (
    <div className="placeholder-editor-backdrop" onClick={onClose}>
      <aside className="placeholder-editor" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">{mode === 'edit' ? 'Edit placeholder' : 'New placeholder'}</span>
          <button aria-label="Close placeholder editor" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>{mode === 'edit' ? 'Update tentative hold' : 'Create tentative hold'}</h2>
        <form onSubmit={handleSubmit}>
          <div className="placeholder-editor-fields">
            {mode === 'edit' ? (
              <label>
                Court
                <select onChange={(event) => updateField('court_id', event.target.value)} required value={form.court_id}>
                  <option value="">Select court</option>
                  {courts.map((court) => <option key={court.id} value={court.id}>{court.name}</option>)}
                </select>
              </label>
            ) : (
              <div className="court-picker">
                <span>Courts</span>
                <div className="court-choice-grid">
                  {courts.map((court) => (
                    <label className={`court-choice ${selectedCourtIds.includes(court.id) ? 'selected' : ''}`} key={court.id}>
                      <input
                        checked={selectedCourtIds.includes(court.id)}
                        onChange={() => toggleCourt(court.id)}
                        type="checkbox"
                      />
                      {court.name}
                    </label>
                  ))}
                </div>
              </div>
            )}
            <div className="form-grid two">
              <label>
                Date
                <input onChange={(event) => updateField('date', event.target.value)} required type="date" value={form.date} />
              </label>
              <label>
                Status
                <select onChange={(event) => updateField('status', event.target.value)} value={form.status}>
                  {PLACEHOLDER_STATUSES.map((status) => <option key={status.value} value={status.value}>{status.label}</option>)}
                </select>
              </label>
            </div>
            <div className="form-grid time-grid">
              <label>
                Start time
                <input onChange={(event) => updateField('start_time', event.target.value)} required type="time" value={form.start_time} />
              </label>
              <label>
                End time
                <input onChange={(event) => updateField('end_time', event.target.value)} required type="time" value={form.end_time} />
              </label>
              <div className="duration-control">
                <span>Duration</span>
                <div className="duration-options">
                  {PLACEHOLDER_DURATION_OPTIONS.map((option) => (
                    <button
                      className={form.duration_mode === String(option.minutes) ? 'selected' : ''}
                      key={option.minutes}
                      onClick={() => setDuration(option.minutes)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  ))}
                  <button
                    className={form.duration_mode === 'custom' ? 'selected' : ''}
                    onClick={() => updateField('duration_mode', 'custom')}
                    type="button"
                  >
                    Custom
                  </button>
                </div>
              </div>
            </div>
            <label>
              Customer name
              <input onChange={(event) => updateField('customer_name', event.target.value)} placeholder="Customer or group name" required value={form.customer_name} />
            </label>
            <label>
              Contact
              <input onChange={(event) => updateField('customer_contact', event.target.value)} placeholder="Phone, WhatsApp, or email" value={form.customer_contact} />
            </label>
            <div className="form-grid two">
              {canViewRevenue ? (
                <label>
                  Estimated price
                  <input
                    inputMode="numeric"
                    onChange={(event) => updateField('estimated_price', parseMoneyInput(event.target.value))}
                    placeholder="Rp 0"
                    value={formatMoneyInput(form.estimated_price)}
                  />
                </label>
              ) : null}
              <label>
                Created by
                <input
                  onChange={(event) => updateField('created_by_name', event.target.value)}
                  placeholder="PIC name"
                  readOnly={isVirtualUser}
                  value={form.created_by_name}
                />
              </label>
            </div>
            <label>
              Updated by
              <input
                onChange={(event) => updateField('updated_by_name', event.target.value)}
                placeholder="PIC name"
                readOnly={isVirtualUser}
                value={form.updated_by_name}
              />
            </label>
            <label>
              Notes
              <textarea onChange={(event) => updateField('notes', event.target.value)} placeholder="Negotiation/payment context" rows={4} value={form.notes} />
            </label>
          </div>
          <div className="editor-footer">
            {liveOverlapCount ? (
              <p className="status-line warning">
                A live booking already uses this slot. This placeholder will be saved as waitlist.
              </p>
            ) : placeholderOverlapCount ? (
              <p className="status-line warning">
                Stacks with {placeholderOverlapCount} existing placeholder{placeholderOverlapCount > 1 ? 's' : ''} in this slot.
              </p>
            ) : null}
            {error ? <p className="status-line error">{error}</p> : null}
            <div className="editor-actions">
              <button className="logout-button" onClick={onClose} type="button">Cancel</button>
              <button className="primary-button" disabled={isSaving} type="submit">
                {isSaving ? 'Saving...' : mode === 'edit' ? 'Save changes' : 'Create placeholder'}
              </button>
            </div>
          </div>
        </form>
      </aside>
    </div>
  );
}

