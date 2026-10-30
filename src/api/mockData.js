// Synthetic test data. Every name and company here is made up.
// Dates are relative to today so the "last contacted" colors stay meaningful.

const DAY = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * DAY).toISOString();

export const organizations = [
  { id: 'org-1', name: 'Ironclad Security Group', country: 'United States', city: 'Arlington, VA', logo: null, archived: false, createdAt: daysAgo(900) },
  { id: 'org-2', name: 'Northwind Tactical', country: 'United Kingdom', city: 'Hereford', logo: null, archived: false, createdAt: daysAgo(1100) },
  { id: 'org-3', name: 'Summit Ridge Logistics', country: 'Kenya', city: 'Nairobi', logo: null, archived: false, createdAt: daysAgo(200) },
  { id: 'org-4', name: 'Granite Point Defense', country: 'United Arab Emirates', city: 'Abu Dhabi', logo: null, archived: false, createdAt: daysAgo(950) },
  { id: 'org-5', name: 'Harbor Line Services', country: 'Djibouti', city: 'Djibouti', logo: null, archived: false, createdAt: daysAgo(2) }, // no people yet
];

const c = (id, firstName, lastName, orgId, title, skills, status, createdDaysAgo, noteDays, extra = {}) => ({
  id,
  firstName,
  lastName,
  orgId,
  title,
  skills,
  status, // 'active' | 'inactive' | 'deceased'
  phones: [{ label: 'Mobile', number: '+1 615 555 0' + id.slice(-3) }],
  emails: [{ label: 'Personal', address: `${firstName}.${lastName}`.toLowerCase() + '@example.com' }],
  address: extra.address ?? '',
  spouse: extra.spouse ?? '',
  children: extra.children ?? [],
  social: extra.social ?? { x: '', instagram: '', snapchat: '', facebook: '' },
  photo: null,
  createdAt: daysAgo(createdDaysAgo),
  notes: noteDays.map((d, i) => ({ id: `${id}-n${i}`, at: daysAgo(d), text: 'Checked in by phone.' })),
});

export const contacts = [
  c('c-101', 'Marcus', 'Hale', 'org-1', 'Team lead', ['Demolitions', 'Close protection'], 'active', 400, [3, 40, 120], {
    address: '1200 Wilson Blvd, Arlington, VA 22209',
    spouse: 'Renee Hale',
    children: ['Caleb', 'Ivy'],
    social: { x: '@mhale', instagram: '', snapchat: '', facebook: 'marcus.hale' },
  }),
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
  c('c-113', 'Sofia', 'Lind', null, 'Freelance interpreter', ['Russian', 'Arabic'], 'active', 30, [8]),
];

export const contracts = [
  { id: 'k-1', contactId: 'c-101', orgId: 'org-1', title: 'Site security detail', location: 'Erbil, Iraq', value: 185000, status: 'active', archived: false, start: daysAgo(60), end: daysAgo(-18), notes: 'Paid monthly. Site lead is Capt. R. Ames. Marcus wants to extend through spring.' },
  { id: 'k-2', contactId: 'c-104', orgId: 'org-3', title: 'Convoy logistics', location: 'Nairobi, Kenya', value: 92000, status: 'active', start: daysAgo(20), end: null, archived: false, notes: '' },
  { id: 'k-3', contactId: 'c-103', orgId: 'org-2', title: 'Aviation support', location: 'Djibouti', value: 240000, status: 'completed', start: daysAgo(400), end: daysAgo(150), archived: false, notes: '' },
  { id: 'k-4', contactId: 'c-105', orgId: 'org-4', title: 'Facility risk review', location: 'Abu Dhabi, UAE', value: 48000, status: 'completed', start: daysAgo(300), end: daysAgo(240), archived: false, notes: '' },
];

// One row per stint at an organization. end: null = current.
export const employment = contacts
  .filter((x) => x.orgId)
  .map((x) => ({ id: `e-${x.id}`, contactId: x.id, orgId: x.orgId, start: x.createdAt, end: null }));

// Past moves between firms, so work history and the Statistics page have something to show.
const pastJob = (contactId, orgId, startDays, endDays) => {
  employment.unshift({ id: `e-${contactId}-${orgId}-${endDays}`, contactId, orgId, start: daysAgo(startDays), end: daysAgo(endDays) });
};
pastJob('c-109', 'org-2', 800, 90); // Victor: Northwind -> Ironclad
pastJob('c-111', 'org-2', 1100, 700); // Rafael: Northwind -> Ironclad
pastJob('c-110', 'org-1', 400, 45); // Grace: Ironclad -> Northwind
pastJob('c-102', 'org-4', 600, 210); // Dana: Granite Point -> Ironclad
pastJob('c-105', 'org-1', 900, 500); // Owen: Ironclad -> Granite Point

// Older check-ins, generated the same way every time, so the Statistics page has a
// year of history. All are older than each person's newest note, so "last contacted" is unchanged.
let seed = 42;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const topics = [
  'Checked in by phone.',
  'Quick text about availability.',
  'Talked about upcoming rotation.',
  'Asked about a referral for a medic.',
  'Caught up after their last contract.',
  'Confirmed new phone number.',
];
contacts.forEach((x) => {
  if (x.notes.length === 0) return;
  const newest = Math.min(...x.notes.map((n) => (Date.now() - new Date(n.at)) / DAY));
  const oldest = Math.min(400, (Date.now() - new Date(x.createdAt)) / DAY);
  let d = newest + 6 + rand() * 20;
  let i = 0;
  while (d < oldest) {
    if (!x.notes.some((n) => Math.abs((Date.now() - new Date(n.at)) / DAY - d) < 3)) {
      x.notes.push({ id: `${x.id}-h${i++}`, at: daysAgo(d), text: topics[Math.floor(rand() * topics.length)] });
    }
    d += 8 + rand() * 30;
  }
});
