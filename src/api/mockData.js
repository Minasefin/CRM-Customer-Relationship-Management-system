// Synthetic test data. Every name and company here is made up.
// Dates are relative to today so the "last contacted" colors stay meaningful.

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

export const organizations = [
  { id: 'org-1', name: 'Ironclad Security Group', country: 'United States', city: 'Arlington, VA', logo: null },
  { id: 'org-2', name: 'Northwind Tactical', country: 'United Kingdom', city: 'Hereford', logo: null },
  { id: 'org-3', name: 'Summit Ridge Logistics', country: 'Kenya', city: 'Nairobi', logo: null },
  { id: 'org-4', name: 'Granite Point Defense', country: 'United Arab Emirates', city: 'Abu Dhabi', logo: null },
];

const c = (id, firstName, lastName, orgId, title, skills, status, createdDaysAgo, noteDays, extra = {}) => ({
  id,
  firstName,
  lastName,
  orgId,
  title,
  skills,
  status, // 'active' | 'inactive' | 'deceased'
  phone: extra.phone ?? '+1 615 555 0' + id.slice(-3).padStart(3, '1'),
  email: `${firstName}.${lastName}`.toLowerCase() + '@example.com',
  photo: null,
  createdAt: daysAgo(createdDaysAgo),
  notes: noteDays.map((d, i) => ({ id: `${id}-n${i}`, at: daysAgo(d), text: 'Checked in by phone.' })),
});

export const contacts = [
  c('c-101', 'Marcus', 'Hale', 'org-1', 'Team lead', ['Demolitions', 'Close protection'], 'active', 400, [3, 40, 120]),
  c('c-102', 'Dana', 'Whitfield', 'org-1', 'Medic', ['Combat medicine', 'Arabic'], 'active', 210, [18, 75]),
  c('c-103', 'Ellis', 'Navarro', 'org-2', 'Pilot', ['Rotary wing', 'Night operations'], 'active', 300, [52, 160]),
  c('c-104', 'Priya', 'Raman', 'org-3', 'Logistics manager', ['Supply chain', 'Swahili'], 'active', 6, [6]),
  c('c-105', 'Owen', 'Castellano', 'org-4', 'Security consultant', ['Risk assessment', 'Demolitions'], 'active', 500, [130, 260]),
  c('c-106', 'Tessa', 'Moreau', 'org-2', 'Intelligence analyst', ['French', 'Signals'], 'active', 12, [11]),
  c('c-107', 'Jamal', 'Okafor', 'org-3', 'Driver', ['Defensive driving', 'Vehicle repair'], 'active', 150, [95]),
  c('c-108', 'Lena', 'Brandt', 'org-4', 'Trainer', ['Firearms instruction', 'German'], 'active', 3, []),
  c('c-109', 'Victor', 'Sato', 'org-1', 'Engineer', ['Explosive ordnance disposal'], 'active', 90, [27, 60]),
  c('c-110', 'Grace', 'Holloway', 'org-2', 'Comms specialist', ['Satellite comms', 'Encryption'], 'active', 45, [44]),
  c('c-111', 'Rafael', 'Duarte', 'org-1', 'Close protection', ['Close protection', 'Portuguese'], 'inactive', 700, [200]),
  c('c-112', 'Hank', 'Mercer', 'org-4', 'Advisor', ['Training', 'Logistics'], 'deceased', 900, [365]),
];

export const contracts = [
  { id: 'k-1', contactId: 'c-101', orgId: 'org-1', title: 'Site security detail', location: 'Erbil, Iraq', value: 185000, status: 'active', start: daysAgo(60), end: null },
  { id: 'k-2', contactId: 'c-104', orgId: 'org-3', title: 'Convoy logistics', location: 'Nairobi, Kenya', value: 92000, status: 'active', start: daysAgo(20), end: null },
  { id: 'k-3', contactId: 'c-103', orgId: 'org-2', title: 'Aviation support', location: 'Djibouti', value: 240000, status: 'completed', start: daysAgo(400), end: daysAgo(150) },
  { id: 'k-4', contactId: 'c-105', orgId: 'org-4', title: 'Facility risk review', location: 'Abu Dhabi, UAE', value: 48000, status: 'completed', start: daysAgo(300), end: daysAgo(240) },
];
