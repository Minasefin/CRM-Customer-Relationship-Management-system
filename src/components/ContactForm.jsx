import { useMemo, useState } from 'react';
import Drawer from './Drawer.jsx';
import ImagePicker from './ImagePicker.jsx';
import TagInput from './TagInput.jsx';
import Icon from './Icon.jsx';
import { OrgFields } from './OrgForm.jsx';
import { DiscardBar, sameName } from './formBits.jsx';

const NEW_ORG = '__new';
const phoneLabels = ['Mobile', 'Work', 'Home', 'Other'];
const emailLabels = ['Personal', 'Work', 'Other'];
const socials = [
  { key: 'x', label: 'X (Twitter)', placeholder: '@handle' },
  { key: 'instagram', label: 'Instagram', placeholder: '@handle' },
  { key: 'snapchat', label: 'Snapchat', placeholder: 'username' },
  { key: 'facebook', label: 'Facebook', placeholder: 'profile name' },
];

const blank = {
  firstName: '',
  lastName: '',
  title: '',
  orgId: '',
  photo: null,
  phones: [{ label: 'Mobile', number: '' }],
  emails: [{ label: 'Personal', address: '' }],
  address: '',
  spouse: '',
  children: [],
  skills: [],
  social: { x: '', instagram: '', snapchat: '', facebook: '' },
};

function fromContact(c) {
  if (!c) return blank;
  return {
    ...blank,
    ...c,
    orgId: c.orgId || '',
    phones: c.phones?.length ? c.phones : blank.phones,
    emails: c.emails?.length ? c.emails : blank.emails,
    social: { ...blank.social, ...(c.social || {}) },
  };
}

// A repeatable row list: phones, emails, children.
function RowList({ rows, onChange, render, addLabel, make }) {
  return (
    <div className="row-list">
      {rows.map((row, i) => (
        <div className="row-item" key={i}>
          {render(row, (next) => onChange(rows.map((r, j) => (j === i ? next : r))))}
          <button
            type="button"
            className="icon-btn"
            aria-label="Remove"
            onClick={() => onChange(rows.filter((_, j) => j !== i))}
          >
            <Icon name="trash" size={16} />
          </button>
        </div>
      ))}
      <button type="button" className="link-btn" onClick={() => onChange([...rows, make()])}>
        <Icon name="plus" size={14} /> {addLabel}
      </button>
    </div>
  );
}

export default function ContactForm({ contact, organizations, contacts, onSave, onCreateOrg, onOpenExisting, onClose }) {
  const start = useMemo(() => fromContact(contact), [contact]);
  const [form, setForm] = useState(start);
  const [errors, setErrors] = useState({});
  const [newOrg, setNewOrg] = useState({ name: '', city: '', country: '', logo: null });
  const [newOrgError, setNewOrgError] = useState('');
  const [step, setStep] = useState('edit'); // 'edit' | 'confirm-move' | 'leaving'
  const [saving, setSaving] = useState(false);

  const isEdit = !!contact;
  const dirty = JSON.stringify(form) !== JSON.stringify(start) || form.orgId === NEW_ORG;
  const set = (k) => (e) => {
    setForm({ ...form, [k]: e.target.value });
    setErrors({ ...errors, [k]: undefined });
  };

  const allSkills = useMemo(() => [...new Set(contacts.flatMap((c) => c.skills))].sort(), [contacts]);
  const duplicate = !isEdit && contacts.find((c) => sameName(`${c.firstName} ${c.lastName}`, `${form.firstName} ${form.lastName}`) && form.lastName.trim());

  const orgName = (id) => (id ? organizations.find((o) => o.id === id)?.name : 'Independent');
  const orgChanged = isEdit && (contact.orgId || '') !== form.orgId;

  const validate = () => {
    const e = {};
    if (!form.firstName.trim()) e.firstName = 'Add a first name.';
    if (!form.lastName.trim()) e.lastName = 'Add a last name.';
    if (form.orgId === NEW_ORG && !newOrg.name.trim()) e.org = 'Name the new organization, or pick one from the list.';
    form.emails.forEach((em, i) => {
      if (em.address.trim() && !/^\S+@\S+\.\S+$/.test(em.address.trim())) e[`email${i}`] = 'This email looks incomplete.';
    });
    setErrors(e);
    if (e.org) setNewOrgError(e.org);
    return Object.keys(e).length === 0;
  };

  const clean = (orgId) => ({
    firstName: form.firstName.trim(),
    lastName: form.lastName.trim(),
    title: form.title.trim(),
    orgId: orgId || null,
    photo: form.photo,
    phones: form.phones.filter((p) => p.number.trim()).map((p) => ({ ...p, number: p.number.trim() })),
    emails: form.emails.filter((m) => m.address.trim()).map((m) => ({ ...m, address: m.address.trim() })),
    address: form.address.trim(),
    spouse: form.spouse.trim(),
    children: form.children.map((c) => c.trim()).filter(Boolean),
    skills: form.skills,
    social: Object.fromEntries(Object.entries(form.social).map(([k, v]) => [k, v.trim()])),
  });

  const commit = async () => {
    setSaving(true);
    let orgId = form.orgId;
    if (orgId === NEW_ORG) {
      const created = await onCreateOrg({ ...newOrg, name: newOrg.name.trim(), city: newOrg.city.trim(), country: newOrg.country.trim() });
      orgId = created.id;
    }
    await onSave(clean(orgId), { moved: isEdit && (contact.orgId || '') !== orgId });
    setSaving(false);
    onClose();
  };

  const save = () => {
    if (!validate()) return;
    if (orgChanged) setStep('confirm-move');
    else commit();
  };

  const requestClose = () => (dirty ? setStep('leaving') : onClose());

  const footer =
    step === 'leaving' ? (
      <DiscardBar onDiscard={onClose} onKeep={() => setStep('edit')} />
    ) : step === 'confirm-move' ? (
      <div className="discard-bar">
        <p>
          Is {form.firstName} moving to{' '}
          <strong>{form.orgId === NEW_ORG ? newOrg.name.trim() : orgName(form.orgId)}</strong>?{' '}
          {contact.orgId ? `Their time at ${orgName(contact.orgId)} will be saved to their work history.` : 'This starts their work history.'}
        </p>
        <div className="btn-row">
          <button className="btn-primary" onClick={commit} disabled={saving}>Yes, they're moving</button>
          <button className="btn-ghost" onClick={() => setStep('edit')}>Cancel</button>
        </div>
      </div>
    ) : (
      <div className="btn-row">
        <button className="btn-primary" onClick={save} disabled={saving}>
          {isEdit ? 'Save changes' : 'Add contact'}
        </button>
        <button className="btn-ghost" onClick={requestClose}>Cancel</button>
      </div>
    );

  const initials = ((form.firstName[0] || '') + (form.lastName[0] || '')).toUpperCase() || '?';

  return (
    <Drawer title={isEdit ? `Edit ${contact.firstName} ${contact.lastName}` : 'Add contact'} onRequestClose={requestClose} footer={footer}>
      <section className="form-section">
        <div className="form-grid">
          <div className="span-2">
            <ImagePicker value={form.photo} onChange={(photo) => setForm({ ...form, photo })} placeholder={initials} label="photo" />
          </div>
          <label className="field">
            <span>First name <em>required</em></span>
            <input value={form.firstName} onChange={set('firstName')} aria-invalid={!!errors.firstName} />
            {errors.firstName && <small className="field-error">{errors.firstName}</small>}
          </label>
          <label className="field">
            <span>Last name <em>required</em></span>
            <input value={form.lastName} onChange={set('lastName')} aria-invalid={!!errors.lastName} />
            {errors.lastName && <small className="field-error">{errors.lastName}</small>}
          </label>
          {duplicate && (
            <p className="warn span-2">
              {duplicate.firstName} {duplicate.lastName} is already in your contacts.{' '}
              <button type="button" className="link-btn" onClick={() => onOpenExisting(duplicate.id)}>Open them instead</button>
            </p>
          )}
          <label className="field span-2">
            <span>Job title</span>
            <input value={form.title} onChange={set('title')} placeholder="e.g. Medic, Pilot, Team lead" />
          </label>
          <label className="field span-2">
            <span>Organization</span>
            <select value={form.orgId} onChange={set('orgId')}>
              <option value="">Independent (no organization)</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
              <option value={NEW_ORG}>+ New organization…</option>
            </select>
          </label>
          {form.orgId === NEW_ORG && (
            <div className="span-2 inline-org">
              <OrgFields value={newOrg} onChange={(v) => { setNewOrg(v); setNewOrgError(''); }} error={newOrgError} withLogo={false} />
              <p className="muted small">You can add a logo later from Organizations.</p>
            </div>
          )}
        </div>
      </section>

      <section className="form-section">
        <h3>Contact</h3>
        <div className="field">
          <span>Phone</span>
          <RowList
            rows={form.phones}
            onChange={(phones) => setForm({ ...form, phones })}
            make={() => ({ label: 'Mobile', number: '' })}
            addLabel="Add phone"
            render={(row, update) => (
              <>
                <select className="row-label" value={row.label} onChange={(e) => update({ ...row, label: e.target.value })} aria-label="Phone type">
                  {phoneLabels.map((l) => <option key={l}>{l}</option>)}
                </select>
                <input type="tel" value={row.number} onChange={(e) => update({ ...row, number: e.target.value })} placeholder="+1 615 555 0123" aria-label="Phone number" />
              </>
            )}
          />
        </div>
        <div className="field">
          <span>Email</span>
          <RowList
            rows={form.emails}
            onChange={(emails) => setForm({ ...form, emails })}
            make={() => ({ label: 'Personal', address: '' })}
            addLabel="Add email"
            render={(row, update) => (
              <>
                <select className="row-label" value={row.label} onChange={(e) => update({ ...row, label: e.target.value })} aria-label="Email type">
                  {emailLabels.map((l) => <option key={l}>{l}</option>)}
                </select>
                <input type="email" value={row.address} onChange={(e) => update({ ...row, address: e.target.value })} placeholder="name@example.com" aria-label="Email address" />
              </>
            )}
          />
          {Object.keys(errors).filter((k) => k.startsWith('email')).map((k) => (
            <small key={k} className="field-error">{errors[k]}</small>
          ))}
        </div>
        <label className="field">
          <span>Home address</span>
          <textarea rows={2} value={form.address} onChange={set('address')} />
        </label>
      </section>

      <section className="form-section">
        <h3>Family</h3>
        <label className="field">
          <span>Spouse</span>
          <input value={form.spouse} onChange={set('spouse')} />
        </label>
        <div className="field">
          <span>Children</span>
          <RowList
            rows={form.children}
            onChange={(children) => setForm({ ...form, children })}
            make={() => ''}
            addLabel="Add child"
            render={(row, update) => <input value={row} onChange={(e) => update(e.target.value)} placeholder="Name" aria-label="Child's name" />}
          />
        </div>
      </section>

      <section className="form-section">
        <h3>Skills</h3>
        <label className="field">
          <span className="sr-only">Skills</span>
          <TagInput id="skills" value={form.skills} onChange={(skills) => setForm({ ...form, skills })} suggestions={allSkills} placeholder="Type a skill and press Enter" />
        </label>
      </section>

      <section className="form-section">
        <h3>Social media</h3>
        <div className="form-grid">
          {socials.map((s) => (
            <label className="field" key={s.key}>
              <span>{s.label}</span>
              <input
                value={form.social[s.key]}
                placeholder={s.placeholder}
                onChange={(e) => setForm({ ...form, social: { ...form.social, [s.key]: e.target.value } })}
              />
            </label>
          ))}
        </div>
      </section>
    </Drawer>
  );
}
