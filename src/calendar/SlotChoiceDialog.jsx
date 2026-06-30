import { CalendarCheck, ClipboardList, X } from 'lucide-react';
import { formatLongDate } from '../lib/datetime.js';

export function SlotChoiceDialog({ draft, onChoosePlaceholder, onChooseRealBooking, onClose }) {
  const courtName = draft?.court_name;
  const slotLabel = draft?.start_time && draft?.end_time
    ? `${draft.start_time}-${draft.end_time}`
    : draft?.start_time || '';
  const dateLabel = draft?.date ? formatLongDate(draft.date) : '';

  return (
    <div className="slot-choice-backdrop" onClick={onClose}>
      <aside className="slot-choice-dialog" onClick={(event) => event.stopPropagation()}>
        <div className="panel-label-row">
          <span className="panel-label">New booking</span>
          <button aria-label="Close booking type panel" onClick={onClose} type="button">
            <X size={16} />
          </button>
        </div>
        <h2>What would you like to add?</h2>
        {(courtName || slotLabel || dateLabel) ? (
          <p className="slot-choice-context">
            {[courtName, dateLabel, slotLabel].filter(Boolean).join(' - ')}
          </p>
        ) : null}
        <div className="slot-choice-options">
          <button className="slot-choice-option" onClick={onChoosePlaceholder} type="button">
            <ClipboardList size={20} />
            <span>
              <strong>Placeholder booking</strong>
              <small>Hold the slot without confirmed payment details.</small>
            </span>
          </button>
          <button className="slot-choice-option primary" onClick={onChooseRealBooking} type="button">
            <CalendarCheck size={20} />
            <span>
              <strong>Real booking</strong>
              <small>Create a confirmed booking on the schedule.</small>
            </span>
          </button>
        </div>
      </aside>
    </div>
  );
}
