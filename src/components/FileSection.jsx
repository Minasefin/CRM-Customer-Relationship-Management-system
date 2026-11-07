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

function readBase64(file) {
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
    <div className="dialog-root" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
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
export default function FileSection({ mode = 'firm', org, contact, contacts = [], contracts = [], employment = [], orgsById = {} }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);
  const [pending, setPending] = useState(null); // a picked file waiting for "who is it about?"
  const [linking, setLinking] = useState(null); // a saved file whose link is being changed
  const input = useRef(null);
  const person = mode === 'person';
  const key = person ? contact.id : org.id;

  // New files are kept with this firm (on a profile: the person's current firm).
  const addOrg = person ? orgsById[contact.orgId] : org;
  const canAdd = !!addOrg && !addOrg.archived && !(person && contact.status !== 'active');

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
    if (person) return [orgsById[f.orgId]?.name, k?.title].filter(Boolean).join(' · ');
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

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setFlash('');
    const mimeType = TYPES[extOf(file.name)];
    if (!mimeType) return setError(`${file.name} can't be added. Use a PDF, Word, Excel or PowerPoint file, an image (PNG, JPEG, GIF, WebP), or a TXT or CSV file.`);
    if (!file.size) return setError(`${file.name} is empty.`);
    if (file.size > MAX) return setError(`${file.name} is ${fileSize(file.size)}. Files can be up to 10 MB.`);
    setPending({ file, mimeType });
  };
  const add = async (links) => {
    const { file, mimeType } = pending;
    await api.addOrganizationAttachment(addOrg.id, { name: file.name, mimeType, dataBase64: await readBase64(file), ...links });
    setPending(null);
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

  const picker = canAdd && <input ref={input} type="file" accept={ACCEPT} hidden onChange={pick} aria-label="Choose a file to add" />;
  const empty = person
    ? `No files about ${contact.firstName} yet.` + (addOrg ? '' : ' Files are kept with a firm, so add them from a firm page.')
    : `No files yet. ${org.archived ? 'Restore the firm to add files.' : "Add contracts, site photos or rosters, up to 10 MB each. They're stored encrypted."}`;

  return (
    <section className={person ? 'panel person-files' : 'org-section firm-files'}>
      {person ? (
        <h2>Files</h2>
      ) : (
        <div className="section-head">
          <h2>Files</h2>
          {canAdd && (
            <button className="btn-ghost" onClick={() => input.current?.click()} disabled={files === null}>
              <Icon name="plus" size={15} /> Add file
            </button>
          )}
        </div>
      )}
      {picker}
      {flash && <p className="banner banner-ok" role="status">{flash}</p>}
      {error && <p className="save-error" role="alert">{error}</p>}
      {files !== null && current.length === 0 && <p className={'muted' + (person ? ' small' : '')}>{empty}</p>}
      {current.length > 0 && <ul className="file-list">{current.map(row)}</ul>}
      {person && canAdd && (
        <button className="link-btn add-under" onClick={() => input.current?.click()} disabled={files === null}>
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
      {pending && (
        <AboutDialog
          title="Who is this file about?"
          fileName={pending.file.name}
          {...choices(addOrg.id, person ? { contactId: contact.id } : {})}
          value={person ? { contactId: contact.id } : {}}
          confirm="Add file"
          onConfirm={add}
          onClose={() => setPending(null)}
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
