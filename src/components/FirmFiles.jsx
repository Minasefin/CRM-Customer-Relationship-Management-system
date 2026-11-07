// Files attached to a firm (issue #41): contracts, site photos, rosters.
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

export default function FirmFiles({ org }) {
  const [files, setFiles] = useState(null);
  const [error, setError] = useState('');
  const [flash, setFlash] = useState('');
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const [preview, setPreview] = useState(null);
  const [saving, setSaving] = useState(null);
  const input = useRef(null);

  const load = () =>
    api
      .getOrganizationAttachments(org.id)
      .then(setFiles)
      .catch((e) => setError(errorText(e)));
  useEffect(() => {
    setFiles(null);
    setError('');
    setFlash('');
    load();
  }, [org.id]);
  useEffect(() => {
    if (!flash) return;
    const t = setTimeout(() => setFlash(''), 5000);
    return () => clearTimeout(t);
  }, [flash]);

  const add = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setError('');
    setFlash('');
    const mimeType = TYPES[extOf(file.name)];
    if (!mimeType) return setError(`${file.name} can't be added. Use a PDF, Word, Excel or PowerPoint file, an image (PNG, JPEG, GIF, WebP), or a TXT or CSV file.`);
    if (!file.size) return setError(`${file.name} is empty.`);
    if (file.size > MAX) return setError(`${file.name} is ${fileSize(file.size)}. Files can be up to 10 MB.`);
    setBusy(true);
    try {
      await api.addOrganizationAttachment(org.id, { name: file.name, mimeType, dataBase64: await readBase64(file) });
      await load();
      setFlash(`Added ${file.name}.`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
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
  const archived = (files || []).filter((f) => f.archived);

  const row = (f) => (
    <li key={f.id} className={'file-row' + (f.archived ? ' is-archived' : '')}>
      <button className="file-open" onClick={() => open(f)} title={canPreview(f.mimeType) ? 'Preview' : 'Save a copy to open it'}>
        <span className={'file-badge file-' + badge(f.name).toLowerCase()} aria-hidden="true">{badge(f.name)}</span>
        <span className="file-name">{f.name}</span>
        <span className="muted small file-meta">{fileSize(f.size)} · {formatDate(f.createdAt)}</span>
      </button>
      {f.archived ? (
        <button className="link-btn" onClick={() => archive(f, false)}>Restore</button>
      ) : (
        <>
          <button className="icon-btn" onClick={() => setSaving(f)} aria-label={`Save a copy of ${f.name}`} title="Save a copy…">
            <Icon name="save" size={16} />
          </button>
          <button className="icon-btn" onClick={() => archive(f, true)} aria-label={`Archive ${f.name}`} title="Archive">
            <Icon name="archived" size={16} />
          </button>
        </>
      )}
    </li>
  );

  return (
    <section className="org-section firm-files">
      <div className="section-head">
        <h2>Files</h2>
        {!org.archived && (
          <>
            <button className="btn-ghost" onClick={() => input.current?.click()} disabled={busy || files === null}>
              <Icon name="plus" size={15} /> {busy ? 'Adding…' : 'Add file'}
            </button>
            <input ref={input} type="file" accept={ACCEPT} hidden onChange={add} aria-label="Choose a file to add" />
          </>
        )}
      </div>
      {flash && <p className="banner banner-ok" role="status">{flash}</p>}
      {error && <p className="save-error" role="alert">{error}</p>}
      {files !== null && current.length === 0 && (
        <p className="muted">
          No files yet. {org.archived ? 'Restore the firm to add files.' : 'Add contracts, site photos or rosters, up to 10 MB each. They\'re stored encrypted.'}
        </p>
      )}
      {current.length > 0 && <ul className="file-list">{current.map(row)}</ul>}
      {archived.length > 0 && (
        <>
          <button className="link-btn file-archived-toggle" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            {showArchived ? 'Hide' : 'Show'} archived files ({archived.length})
          </button>
          {showArchived && <ul className="file-list">{archived.map(row)}</ul>}
        </>
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
