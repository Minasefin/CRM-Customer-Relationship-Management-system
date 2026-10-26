import { freshness, formatDate, relativeDays } from '../lib/freshness.js';
import { useSettings } from '../hooks/useSettings.js';

const R = 30;
const CIRC = 2 * Math.PI * R;

// The ring around the photo drains as time passes since the last contact,
// and changes color at the stale / overdue thresholds set in Settings.
function Avatar({ contact, f }) {
  const initials = (contact.firstName[0] + contact.lastName[0]).toUpperCase();
  return (
    <div className={`avatar level-${f.level}`}>
      <svg viewBox="0 0 68 68" className="avatar-ring" aria-hidden="true">
        <circle cx="34" cy="34" r={R} className="ring-track" />
        <circle
          cx="34"
          cy="34"
          r={R}
          className="ring-fill"
          strokeDasharray={CIRC}
          strokeDashoffset={CIRC * (1 - f.remaining)}
          transform="rotate(-90 34 34)"
        />
      </svg>
      {contact.photo ? <img src={contact.photo} alt="" /> : <span className="avatar-initials">{initials}</span>}
    </div>
  );
}

export default function ContactCard({ contact, org }) {
  const settings = useSettings()[0];
  const f = freshness(contact, settings);
  const archived = contact.status !== 'active';

  return (
    <article className={'contact-card' + (archived ? ' is-archived' : '')} tabIndex={0}>
      <Avatar contact={contact} f={f} />
      <h3 className="contact-name">
        {contact.firstName} {contact.lastName}
      </h3>
      <p className="contact-role">
        {contact.title}
        {org && <span className="contact-org">{org.name}</span>}
      </p>

      {archived ? (
        <p className={`status-pill status-${contact.status}`}>{contact.status === 'deceased' ? 'Deceased' : 'Left / inactive'}</p>
      ) : f.level === 'never' ? (
        <p className="last-contacted level-never">Not contacted yet</p>
      ) : (
        <p className={`last-contacted level-${f.level}`}>
          <span className="dot" aria-hidden="true" />
          Last contacted {formatDate(f.last)}
          <span className="ago">{relativeDays(f.days)}</span>
        </p>
      )}

      {contact.skills.length > 0 && (
        <ul className="skills">
          {contact.skills.slice(0, 2).map((s) => (
            <li key={s}>{s}</li>
          ))}
        </ul>
      )}
    </article>
  );
}
