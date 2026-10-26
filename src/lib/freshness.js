// "Last contacted" comes from a contact's newest note.
const DAY = 24 * 60 * 60 * 1000;

export function lastContacted(contact) {
  if (!contact.notes || contact.notes.length === 0) return null;
  return contact.notes.reduce((latest, n) => (n.at > latest ? n.at : latest), contact.notes[0].at);
}

export function daysSince(iso) {
  return Math.floor((Date.now() - new Date(iso).getTime()) / DAY);
}

// level: 'fresh' | 'stale' | 'overdue' | 'never'
export function freshness(contact, { staleAfter = 30, overdueAfter = 90 } = {}) {
  const last = lastContacted(contact);
  if (!last) return { level: 'never', days: null, last: null, remaining: 0 };
  const days = daysSince(last);
  const level = days < staleAfter ? 'fresh' : days < overdueAfter ? 'stale' : 'overdue';
  // Ring drains from full (just contacted) toward empty, then turns solid red once overdue.
  const remaining = level === 'overdue' ? 1 : Math.max(0.08, 1 - days / overdueAfter);
  return { level, days, last, remaining };
}

export function formatDate(iso) {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(sameYear ? {} : { year: 'numeric' }) });
}

export function relativeDays(days) {
  if (days === 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
}
