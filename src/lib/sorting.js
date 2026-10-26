// Sort options for Contacts, Organizations and Contracts.
import { lastContacted } from './freshness.js';

const byText = (get) => (a, b) => get(a).localeCompare(get(b), undefined, { sensitivity: 'base' });
const desc = (get) => (a, b) => (get(b) ?? -Infinity) - (get(a) ?? -Infinity);
const time = (iso) => (iso ? new Date(iso).getTime() : null);
const fullName = (c) => `${c.lastName} ${c.firstName}`;

export const contactSorts = [
  { id: 'overdue', label: 'Longest since contact', fn: (a, b) => (time(lastContacted(a)) ?? 0) - (time(lastContacted(b)) ?? 0) },
  { id: 'recent-contact', label: 'Most recently contacted', fn: desc((c) => time(lastContacted(c))) },
  { id: 'added', label: 'Recently added', fn: desc((c) => time(c.createdAt)) },
  { id: 'az', label: 'Last name A to Z', fn: byText(fullName) },
  { id: 'za', label: 'Last name Z to A', fn: (a, b) => byText(fullName)(b, a) },
];

// ctx = { contacts, contracts, employment }
export const orgSorts = [
  { id: 'az', label: 'Name A to Z', fn: () => byText((o) => o.name) },
  { id: 'za', label: 'Name Z to A', fn: () => (a, b) => byText((o) => o.name)(b, a) },
  { id: 'added', label: 'Recently added', fn: () => desc((o) => time(o.createdAt)) },
  {
    id: 'money',
    label: 'Most contract money',
    fn: ({ contracts }) => desc((o) => contracts.filter((k) => k.orgId === o.id).reduce((sum, k) => sum + (k.value || 0), 0)),
  },
  {
    id: 'people',
    label: 'Most people now',
    fn: ({ contacts }) => desc((o) => contacts.filter((c) => c.orgId === o.id && c.status === 'active').length),
  },
  {
    id: 'hires',
    label: 'Most hires',
    fn: ({ employment }) => desc((o) => new Set(employment.filter((e) => e.orgId === o.id).map((e) => e.contactId)).size),
  },
  {
    id: 'contacted',
    label: 'Recently contacted',
    fn: ({ contacts }) =>
      desc((o) => {
        const times = contacts.filter((c) => c.orgId === o.id).map((c) => time(lastContacted(c))).filter(Boolean);
        return times.length ? Math.max(...times) : null;
      }),
  },
];

export const contractSorts = [
  { id: 'active', label: 'On contract first', fn: (a, b) => (a.status === b.status ? (time(b.start) ?? 0) - (time(a.start) ?? 0) : a.status === 'active' ? -1 : 1) },
  { id: 'newest', label: 'Newest', fn: desc((k) => time(k.start)) },
  { id: 'oldest', label: 'Oldest', fn: (a, b) => (time(a.start) ?? 0) - (time(b.start) ?? 0) },
  { id: 'value-high', label: 'Highest value', fn: desc((k) => k.value || 0) },
  { id: 'value-low', label: 'Lowest value', fn: (a, b) => (a.value || 0) - (b.value || 0) },
  { id: 'az', label: 'Name A to Z', fn: byText((k) => k.title) },
];

// A firm can only be deleted if nothing points to it.
export function canDeleteOrg(org, { contacts, contracts, employment }) {
  return (
    !contacts.some((c) => c.orgId === org.id) &&
    !employment.some((e) => e.orgId === org.id) &&
    !contracts.some((k) => k.orgId === org.id)
  );
}
