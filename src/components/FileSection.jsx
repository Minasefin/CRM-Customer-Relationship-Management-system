// Files (issue #41): contracts, site photos, rosters. Each file is kept with a firm and can
// be about one person and/or one of that firm's contracts. Shown on the firm page (all of
// its files) and on a person's profile (every file about them, from any firm).
// They're stored inside the encrypted database (Adrian's API). Images and text files
// preview inside the app. Anything can be saved out as a copy, after a warning that the
// copy is a normal, unencrypted file. The main process does the saving; this screen
// never handles a file path.
import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { api } from '../api/index.js';
import Icon from './Icon.jsx';
import { errorText } from './formBits.jsx';
import { formatDate } from '../lib/freshness.js';
import { shortName } from '../lib/names.js';

const MAX = 10 * 1024 * 1024; // same limit as database/attachments.cjs

// Same list as database/attachments.cjs. The type comes from the file's extension so it
// always matches what the database accepts (browsers report CSV differently per system).
const TYPES = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};
const ACCEPT = Object.keys(TYPES).join(',');
const extOf = (name) => (String(name).match(/\.[^.]+$/)?.[0] || '').toLowerCase();
const canPreview = (mime) => mime.startsWith('image/') || mime === 'text/plain' || mime === 'text/csv';
const LABELS = { pdf: 'PDF', png: 'PNG', jpg: 'JPG', jpeg: 'JPG', gif: 'GIF', webp: 'WEBP', txt: 'TXT', csv: 'CSV', docx: 'DOC', xlsx: 'XLS', pptx: 'PPT' };
const badge = (name) => LABELS[extOf(name).slice(1)] || 'FILE';

export const fileSize = (n) =>
  n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;

export function readBase64(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).slice(String(r.result).indexOf(',') + 1));
    r.onerror = () => reject(new Error("Couldn't read that file."));
    r.readAsDataURL(file);
  });
}

function Dialog({ title, children, onClose, wide, label }) {
  const box = useRef(null);
  useEffect(() => {
    box.current?.querySelector('.btn-primary')?.focus();
  }, []);
  return createPortal(
    // Keys stay inside the pop-up (it can sit on top of a form that saves on Enter / closes on Esc).
    <div className="dialog-root" onKeyDown={(e) => { e.stopPropagation(); if (e.key === 'Escape') onClose(); }}>
      <div className="drawer-scrim" onClick={onClose} />
      <div ref={box} className={'dialog dialog-wide' + (wide ? ' file-preview' : '')} role="dialog" aria-modal="true" aria-label={label || title}>
        <h2>{title}</h2>
        {children}
      </div>
    </div>,
    document.body,
  );
}

// "Save a copy…": warn first, then the system save dialog (main process).
function SaveCopyDialog({ file, onDone, onClose }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const save = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.saveAttachmentCopy(file.id);
      if (r && r.ok) onDone(`Saved a copy of ${file.name}.`);
      else setBusy(false); // canceled in the save dialog
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const close = () => !busy && onClose();
  return (
    <Dialog title="Save a copy?" onClose={close}>
      <p className="muted">This copy won't be encrypted. Anyone who can open that folder can read it.</p>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="btn-row">
        <button className="btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save…'}</button>
        <button className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
      </div>
    </Dialog>
  );
}

// Images and text files open here. Text is shown as text (never as HTML).
function PreviewDialog({ file, onSave, onClose }) {
  const [content, setContent] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    api
      .getOrganizationAttachment(file.id)
      .then((full) => {
        if (!live) return;
        if (file.mimeType.startsWith('image/')) setContent({ src: `data:${file.mimeType};base64,${full.dataBase64}` });
        else {
          const bytes = Uint8Array.from(atob(full.dataBase64), (ch) => ch.charCodeAt(0));
          const text = new TextDecoder('utf-8').decode(bytes);
          setContent({ text: text.length > 200000 ? text.slice(0, 200000) + '\n…' : text });
        }
      })
      .catch((e) => live && setError(errorText(e)));
    return () => {
      live = false;
    };
  }, [file]);
  return (
    <Dialog title={file.name} onClose={onClose} wide label={`Preview of ${file.name}`}>
      <p className="muted small file-meta">{fileSize(file.size)} · added {formatDate(file.createdAt)}</p>
      <div className="file-preview-body">
        {error && <p className="save-error" role="alert">{error}</p>}
        {!content && !error && <p className="muted">Opening…</p>}
        {content?.src && <img src={content.src} alt={file.name} />}
        {content?.text != null && <pre>{content.text}</pre>}
      </div>
      <div className="btn-row">
        <button className="btn-primary" onClick={onClose}>Close</button>
        <button className="btn-ghost" onClick={onSave}>Save a copy…</button>
      </div>
    </Dialog>
  );
}

// Who or what a file is about: an optional person and an optional contract of the same firm.
function AboutDialog({ title, fileName, people, contracts, value, confirm, onConfirm, onClose }) {
  const [contactId, setContactId] = useState(value.contactId || '');
  const [contractId, setContractId] = useState(value.contractId || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const pickContract = (id) => {
    setContractId(id);
    // Picking a contract fills in its contractor if no person is chosen yet.
    const k = contracts.find((c) => c.id === id);
    if (k && !contactId && people.some((p) => p.id === k.contactId)) setContactId(k.contactId);
  };
  const go = async () => {
    setBusy(true);
    setError('');
    try {
      await onConfirm({ contactId: contactId || null, contractId: contractId || null });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const close = () => !busy && onClose();
  return (
    <Dialog title={title} onClose={close}>
      <p className="muted file-about-name">{fileName}</p>
      <div className="file-about-fields">
        <label className="field">
          <span>Person</span>
          <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={busy}>
            <option value="">Nobody in particular</option>
            {people.map((p) => <option key={p.id} value={p.id}>{shortName(p)}</option>)}
          </select>
        </label>
        <label className="field">
          <span>Contract</span>
          <select value={contractId} onChange={(e) => pickContract(e.target.value)} disabled={busy}>
            <option value="">No contract</option>
            {contracts.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
          </select>
        </label>
      </div>
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="btn-row">
        <button className="btn-primary" onClick={go} disabled={busy}>{busy ? 'Saving…' : confirm}</button>
        <button className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
      </div>
    </Dialog>
  );
}

// mode 'firm':   every file kept with `org`, each labelled with who/what it's about.
// mode 'person': every file about `contact`, from any firm (a compact panel on the profile).
// Problem with a picked file, or '' if it can be added. Same rules as the database.
export function fileProblem(file) {
  if (!TYPES[extOf(file.name)]) return `${file.name} can't be added. Use a PDF, Word, Excel or PowerPoint file, an image (PNG, JPEG, GIF, WebP), or a TXT or CSV file.`;
  if (!file.size) return `${file.name} is empty.`;
  if (file.size > MAX) return `${file.name} is ${fileSize(file.size)}. Files can be up to 10 MB.`;
  return '';
}
export const fileType = (name) => TYPES[extOf(name)];

// Add a file: drop it in (or "Choose a file…" opens Finder / File Explorer), say who it's
// about, then Add file. about={false} skips the who/what question (e.g. in a contact's form).
export function AddFileDialog({ title = 'Add a file', people = [], contracts = [], value = {}, about = true, confirm = 'Add file', note, onAdd, onClose }) {
  const [picked, setPicked] = useState(null); // { file, mimeType }
  const [contactId, setContactId] = useState(value.contactId || '');
  const [contractId, setContractId] = useState(value.contractId || '');
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const input = useRef(null);
  const choose = () => input.current?.click();
  const take = (file) => {
    if (!file) return;
    const problem = fileProblem(file);
    setError(problem);
    if (!problem) setPicked({ file, mimeType: fileType(file.name) });
  };
  const drop = (e) => {
    e.preventDefault();
    setOver(false);
    const list = e.dataTransfer?.files;
    if (list && list.length > 1) return setError('Add one file at a time.');
    take(list?.[0]);
  };
  const pickContract = (id) => {
    setContractId(id);
    const k = contracts.find((c) => c.id === id);
    if (k && !contactId && people.some((p) => p.id === k.contactId)) setContactId(k.contactId);
  };
  const go = async () => {
    if (!picked) return setError('Choose a file first.');
    setBusy(true);
    setError('');
    try {
      await onAdd(picked, { contactId: contactId || null, contractId: contractId || null });
    } catch (e) {
      setError(errorText(e));
      setBusy(false);
    }
  };
  const close = () => !busy && onClose();
  return (
    <Dialog title={title} onClose={close}>
      <div
        className={'dropzone' + (over ? ' is-over' : '') + (picked ? ' has-file' : '')}
        onDragEnter={(e) => { e.preventDefault(); setOver(true); }}
        onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; setOver(true); }}
        onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setOver(false); }}
        onDrop={drop}
        onClick={() => !picked && !busy && choose()}
        onKeyDown={(e) => { if (!picked && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); choose(); } }}
        role={picked ? undefined : 'button'}
        tabIndex={picked ? undefined : 0}
        aria-label={picked ? undefined : 'Drop a file here, or choose a file'}
      >
        {picked ? (
          <div className="dropzone-file">
            <span className={'file-badge file-' + badge(picked.file.name).toLowerCase()} aria-hidden="true">{badge(picked.file.name)}</span>
            <span className="file-text">
              <span className="file-name">{picked.file.name}</span>
              <span className="file-about">{fileSize(picked.file.size)}</span>
            </span>
            <button type="button" className="link-btn" onClick={(e) => { e.stopPropagation(); choose(); }} disabled={busy}>Choose a different file</button>
          </div>
        ) : (
          <>
            <span className="dropzone-icon" aria-hidden="true"><Icon name="save" size={22} /></span>
            <strong>{over ? 'Drop it here' : 'Drop a file here'}</strong>
            <span className="muted">or</span>
            <span className="btn-ghost dropzone-choose">Choose a file…</span>
            <small className="muted">PDF, Word, Excel, PowerPoint, images, TXT or CSV · up to 10 MB</small>
          </>
        )}
      </div>
      <input ref={input} type="file" accept={ACCEPT} hidden onChange={(e) => { take(e.target.files?.[0]); e.target.value = ''; }} aria-label="Choose a file to add" />
      <p className="dropzone-lock"><Icon name="lock" size={14} /> {note || 'Stored encrypted inside Auria, with the rest of your data.'}</p>
      {about && (
        <div className="file-about-fields">
          <label className="field">
            <span>Person</span>
            <select value={contactId} onChange={(e) => setContactId(e.target.value)} disabled={busy}>
              <option value="">Nobody in particular</option>
              {people.map((p) => <option key={p.id} value={p.id}>{shortName(p)}</option>)}
            </select>
          </label>
          <label className="field">
            <span>Contract</span>
            <select value={contractId} onChange={(e) => pickContract(e.target.value)} disabled={busy}>
              <option value="">No contract</option>
              {contracts.map((k) => <option key={k.id} value={k.id}>{k.title}</option>)}
            </select>
          </label>
        </div>
      )}
      {error && <p className="save-error" role="alert">{error}</p>}
      <div className="btn-row">
        <button className="btn-primary" onClick={go} disabled={busy || !picked}>{busy ? 'Adding…' : confirm}</button>
        <button className="btn-ghost" onClick={close} disabled={busy}>Cancel</button>
      </div>
    </Dialog>
  );
}

// The Files part of the contact and contract forms. Files picked here wait in the form
// (`pending`) and are added after the form saves, so Cancel / Discard still drop them.
export function FormFiles({ saved = [], pending, onChange, who }) {
  const [adding, setAdding] = useState(false);
  return (
    <section className="form-section">
      <h3>Files</h3>
      {saved.length > 0 && (
        <ul className="form-files">
          {saved.map((f) => (
            <li key={f.id}>
              <span className={'file-badge file-' + badge(f.name).toLowerCase()} aria-hidden="true">{badge(f.name)}</span>
              <span className="form-file-name">{f.name}</span>
              <span className="muted small">{fileSize(f.size)}</span>
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <ul className="form-files">
          {pending.map((f, i) => (
            <li key={i} className="is-new">
              <span className={'file-badge file-' + badge(f.file.name).toLowerCase()} aria-hidden="true">{badge(f.file.name)}</span>
              <span className="form-file-name">{f.file.name}</span>
              <span className="muted small">{fileSize(f.file.size)} · added when you save</span>
              <button type="button" className="icon-btn" aria-label={`Remove ${f.file.name}`} onClick={() => onChange(pending.filter((_, j) => j !== i))}>
                <Icon name="trash" size={16} />
              </button>
            </li>
          ))}
        </ul>
      )}
      <button type="button" className="link-btn" onClick={() => setAdding(true)}>
        <Icon name="plus" size={14} /> Add file
      </button>
      {adding && (
        <AddFileDialog
          title={who ? `Add a file to ${who}` : 'Add a file'}
          about={false}
          confirm="Add"
          note="Stored encrypted inside Auria when you save."
          onAdd={(picked) => {
            onChange([...pending, picked]);
            setAdding(false);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </section>
  );
}

export default function FileSection({ mode = 'firm', org, contact, contacts = [], contracts = [], employment = [], orgsById = {} }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);
  const [adding, setAdding] = useState(false); // the Add file pop-up
  const [linking, setLinking] = useState(null); // a saved file whose link is being changed
  const person = mode === 'person';
  const key = person ? contact.id : org.id;

  // New files are kept with this firm (on a profile: the person's current firm).
  // On a profile, new files are about this person, kept with their current firm (or none).
  const addOrg = person ? orgsById[contact.orgId] || null : org;
  const canAdd = person ? !addOrg?.archived : !org.archived;

  const byId = Object.fromEntries(contacts.map((c) => [c.id, c]));
  const contractsById = Object.fromEntries(contracts.map((k) => [k.id, k]));
  // Choices for a file kept with firm `orgId`: anyone who works or worked there, and its contracts.
  const choices = (orgId, current = {}) => ({
    people: contacts
      .filter((c) => c.orgId === orgId || c.id === current.contactId || employment.some((e) => e.orgId === orgId && e.contactId === c.id))
      .sort((a, b) => shortName(a).localeCompare(shortName(b))),
    contracts: contracts.filter((k) => k.orgId === orgId && (!k.archived || k.id === current.contractId)),
  });
  const about = (f) => {
    const k = f.contractId && contractsById[f.contractId];
    if (person) return [f.orgId ? orgsById[f.orgId]?.name : 'No firm', k?.title].filter(Boolean).join(' · ');
    const p = f.contactId && byId[f.contactId];
    return [p && shortName(p), k?.title].filter(Boolean).join(' · ') || 'Whole firm';
  };

  const load = () =>
    (person ? api.getContactAttachments(contact.id) : api.getOrganizationAttachments(org.id))
      .then(setFiles)
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    setFiles(null);
    setError('');
    setFlash('');
    load();
  }, [key]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  const add = async ({ file, mimeType }, links) => {
    const body = { name: file.name, mimeType, dataBase64: await readBase64(file) };
    if (person) await api.addContactAttachment(contact.id, body);
    else await api.addOrganizationAttachment(org.id, { ...body, ...links });
    setAdding(false);
    await load();
    setFlash(`Added ${file.name}.`);
  };
  const relink = async (links) => {
    const f = linking;
    await api.linkOrganizationAttachment(f.id, links);
    setLinking(null);
    await load();
    setFlash(`Updated ${f.name}.`);
  };
  const archive = async (f, archived) => {
    setError('');
    try {
      await api.archiveOrganizationAttachment(f.id, archived);
      await load();
      setFlash(archived ? `Archived ${f.name}.` : `Restored ${f.name}.`);
    } catch (e) {
      setError(errorText(e));
    }
  };

  const open = (f) => (canPreview(f.mimeType) ? setPreview(f) : setSaving(f));
  const current = (files || []).filter((f) => !f.archived);
  const archived = person ? [] : (files || []).filter((f) => f.archived);

  const row = (f) => (
    <li key={f.id} className={'file-row' + (f.archived ? ' is-archived' : '')}>
      <button className="file-open" onClick={() => open(f)} title={`${f.name} · ${about(f)}`}>
        <span className={'file-badge file-' + badge(f.name).toLowerCase()} aria-hidden="true">{badge(f.name)}</span>
        <span className="file-text">
          <span className="file-name">{f.name}</span>
          <span className="file-about">{about(f)}</span>
        </span>
        {!person && <span className="muted small file-meta">{fileSize(f.size)} · {formatDate(f.createdAt)}</span>}
      </button>
      {f.archived ? (
        <button className="link-btn" onClick={() => archive(f, false)}>Restore</button>
      ) : (
        <>
          <button className="icon-btn" onClick={() => setLinking(f)} aria-label={`Change who ${f.name} is about`} title="Who is it about?">
            <Icon name="edit" size={15} />
          </button>
          <button className="icon-btn" onClick={() => setSaving(f)} aria-label={`Save a copy of ${f.name}`} title="Save a copy…">
            <Icon name="save" size={16} />
          </button>
          {!person && (
            <button className="icon-btn" onClick={() => archive(f, true)} aria-label={`Archive ${f.name}`} title="Archive">
              <Icon name="archived" size={16} />
            </button>
          )}
        </>
      )}
    </li>
  );

  const empty = person
    ? `No files about ${contact.firstName} yet.`
    : `No files yet. ${org.archived ? 'Restore the firm to add files.' : "Add contracts, site photos or rosters, up to 10 MB each. They're stored encrypted."}`;

  return (
    <section className={person ? 'panel person-files' : 'org-section firm-files'}>
      {person ? (
        <h2>Files</h2>
      ) : (
        <div className="section-head">
          <h2>Files</h2>
          {canAdd && (
            <button className="btn-ghost" onClick={() => { setFlash(''); setError(''); setAdding(true); }} disabled={files === null}>
              <Icon name="plus" size={15} /> Add file
            </button>
          )}
        </div>
      )}
            {flash && <p className="banner banner-ok" role="status">{flash}</p>}
      {error && <p className="save-error" role="alert">{error}</p>}
      {files !== null && current.length === 0 && <p className={'muted' + (person ? ' small' : '')}>{empty}</p>}
      {current.length > 0 && <ul className="file-list">{current.map(row)}</ul>}
      {person && canAdd && (
        <button className="link-btn add-under" onClick={() => { setFlash(''); setError(''); setAdding(true); }} disabled={files === null}>
          <Icon name="plus" size={14} /> Add file
        </button>
      )}
      {archived.length > 0 && (
        <>
          <button className="link-btn file-archived-toggle" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            {showArchived ? 'Hide' : 'Show'} archived files ({archived.length})
          </button>
          {showArchived && <ul className="file-list">{archived.map(row)}</ul>}
        </>
      )}
      {adding && (
        <AddFileDialog
          title={person ? `Add a file about ${contact.firstName}` : `Add a file to ${org.name}`}
          {...(person ? {} : choices(org.id))}
          about={!person}
          onAdd={add}
          onClose={() => setAdding(false)}
        />
      )}
      {linking && (
        <AboutDialog
          title="Who is this file about?"
          fileName={linking.name}
          {...choices(linking.orgId, linking)}
          value={linking}
          confirm="Save"
          onConfirm={relink}
          onClose={() => setLinking(null)}
        />
      )}
      {preview && (
        <PreviewDialog
          file={preview}
          onClose={() => setPreview(null)}
          onSave={() => {
            setSaving(preview);
            setPreview(null);
          }}
        />
      )}
      {saving && (
        <SaveCopyDialog
          file={saving}
          onClose={() => setSaving(null)}
          onDone={(msg) => {
            setSaving(null);
            setFlash(msg);
          }}
        />
      )}
    </section>
  );
}
