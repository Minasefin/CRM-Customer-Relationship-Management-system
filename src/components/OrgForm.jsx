import { useState } from 'react';
import Drawer from './Drawer.jsx';
import ImagePicker from './ImagePicker.jsx';
import { DiscardBar, orgInitials, sameName } from './formBits.jsx';

const blank = { name: '', city: '', country: '', logo: null };

export function OrgFields({ value, onChange, error, withLogo = true }) {
  const set = (k) => (e) => onChange({ ...value, [k]: e.target.value });
  return (
    <div className="form-grid">
      {withLogo && (
        <div className="span-2">
          <ImagePicker
            value={value.logo}
            onChange={(logo) => onChange({ ...value, logo })}
            placeholder={orgInitials(value.name) || '?'}
            shape="square"
            label="logo"
          />
        </div>
      )}
      <label className="field span-2">
        <span>Organization name <em>required</em></span>
        <input value={value.name} onChange={set('name')} aria-invalid={!!error} />
        {error && <small className="field-error">{error}</small>}
      </label>
      <label className="field">
        <span>City</span>
        <input value={value.city} onChange={set('city')} placeholder="e.g. Nairobi" />
      </label>
      <label className="field">
        <span>Country</span>
        <input value={value.country} onChange={set('country')} placeholder="e.g. Kenya" />
      </label>
    </div>
  );
}

export default function OrgForm({ org, organizations, onSave, onClose }) {
  const start = org ? { ...blank, ...org } : blank;
  const [form, setForm] = useState(start);
  const [error, setError] = useState('');
  const [leaving, setLeaving] = useState(false);
  const [saving, setSaving] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(start);

  const duplicate = organizations.find((o) => o.id !== org?.id && sameName(o.name, form.name));

  const save = async () => {
    if (!form.name.trim()) return setError('Add the organization name.');
    setSaving(true);
    await onSave({ name: form.name.trim(), city: form.city.trim(), country: form.country.trim(), logo: form.logo });
    setSaving(false);
    onClose();
  };

  const requestClose = () => (dirty ? setLeaving(true) : onClose());

  return (
    <Drawer
      title={org ? `Edit ${org.name}` : 'Add organization'}
      onRequestClose={requestClose}
      footer={
        leaving ? (
          <DiscardBar onDiscard={onClose} onKeep={() => setLeaving(false)} />
        ) : (
          <div className="btn-row">
            <button className="btn-primary" onClick={save} disabled={saving}>
              {org ? 'Save changes' : 'Add organization'}
            </button>
            <button className="btn-ghost" onClick={requestClose}>Cancel</button>
          </div>
        )
      }
    >
      <OrgFields value={form} onChange={(v) => { setForm(v); setError(''); }} error={error} />
      {duplicate && <p className="warn">{duplicate.name} is already in your organizations.</p>}
    </Drawer>
  );
}
