import { useState } from 'react';
import Drawer from './Drawer.jsx';
import { DiscardBar } from './formBits.jsx';

const toDateInput = (iso) => (iso ? iso.slice(0, 10) : '');
const fromDateInput = (d) => (d ? new Date(`${d}T12:00:00`).toISOString() : null);

export default function ContractForm({ contract, contactId, contacts, organizations, onSave, onClose }) {
  const start = {
    contactId: contract?.contactId || contactId || '',
    title: contract?.title || '',
    location: contract?.location || '',
    value: contract?.value != null ? String(contract.value) : '',
    status: contract?.status || 'active',
    start: toDateInput(contract?.start) || new Date().toISOString().slice(0, 10),
    end: toDateInput(contract?.end),
    notes: contract?.notes || '',
  };
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState({});
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);

  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
  };

  const people = contacts
    .filter((c) => c.status === 'active' || c.id === form.contactId)
    .sort((a, b) => `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`));
  const orgName = (id) => organizations.find((o) => o.id === id)?.name;

  const save = async () => {
    const e = {};
    if (!form.contactId) e.contactId = 'Pick who the contract is with.';
    if (!form.title.trim()) e.title = 'Name the contract.';
    const value = form.value.replace(/[$,\s]/g, '');
    if (value && !/^\d+(\.\d+)?$/.test(value)) e.value = 'Use numbers only, like 185000.';
    if (form.end && form.start && form.end < form.start) e.end = 'The end date is before the start date.';
    setErrors(e);
    if (Object.keys(e).length) return;

    setSaving(true);
    const person = contacts.find((c) => c.id === form.contactId);
    await onSave({
      contactId: form.contactId,
      orgId: contract?.orgId ?? person?.orgId ?? null,
      title: form.title.trim(),
      location: form.location.trim(),
      value: value ? Math.round(Number(value)) : 0,
      status: form.status,
      start: fromDateInput(form.start),
      end: form.status === 'completed' ? fromDateInput(form.end) || new Date().toISOString() : fromDateInput(form.end),
      notes: form.notes.trim(),
    });
    setSaving(false);
    onClose();
  };

  const requestClose = () => (dirty ? setLeaving(true) : onClose());

  return (
    <Drawer
      title={contract ? `Edit ${contract.title}` : 'Add contract'}
      onRequestClose={requestClose}
      footer={
        leaving ? (
          <DiscardBar onDiscard={onClose} onKeep={() => setLeaving(false)} />
        ) : (
          <div className="btn-row">
            <button className="btn-primary" onClick={save} disabled={saving}>{contract ? 'Save changes' : 'Add contract'}</button>
            <button className="btn-ghost" onClick={requestClose}>Cancel</button>
          </div>
        )
      }
    >
      <div className="form-grid form-section">
        <label className="field span-2">
          <span>Contractor <em>required</em></span>
          <select value={form.contactId} onChange={set('contactId')} aria-invalid={!!errors.contactId}>
            <option value="">Choose a person…</option>
            {people.map((c) => (
              <option key={c.id} value={c.id}>
                {c.firstName} {c.lastName}{c.orgId ? `, ${orgName(c.orgId)}` : ', Independent'}
              </option>
            ))}
          </select>
          {errors.contactId && <small className="field-error">{errors.contactId}</small>}
        </label>
        <label className="field span-2">
          <span>Contract name <em>required</em></span>
          <input value={form.title} onChange={set('title')} placeholder="e.g. Site security detail" aria-invalid={!!errors.title} />
          {errors.title && <small className="field-error">{errors.title}</small>}
        </label>
        <label className="field">
          <span>Location</span>
          <input value={form.location} onChange={set('location')} placeholder="e.g. Erbil, Iraq" />
        </label>
        <label className="field">
          <span>Value (US dollars)</span>
          <input value={form.value} onChange={set('value')} inputMode="numeric" placeholder="185000" aria-invalid={!!errors.value} />
          {errors.value && <small className="field-error">{errors.value}</small>}
        </label>
        <label className="field span-2">
          <span>Status</span>
          <select value={form.status} onChange={set('status')}>
            <option value="active">On contract now</option>
            <option value="completed">Completed</option>
          </select>
        </label>
        <label className="field">
          <span>Start date</span>
          <input type="date" value={form.start} onChange={set('start')} />
        </label>
        <label className="field">
          <span>{form.status === 'completed' ? 'End date' : 'Expected end date'}</span>
          <input type="date" value={form.end} onChange={set('end')} aria-invalid={!!errors.end} />
          {errors.end && <small className="field-error">{errors.end}</small>}
        </label>
        <label className="field span-2">
          <span>Notes</span>
          <textarea
            rows={5}
            value={form.notes}
            onChange={set('notes')}
            placeholder="Terms, point of contact on site, payment schedule, anything worth remembering"
          />
        </label>
      </div>
    </Drawer>
  );
}
