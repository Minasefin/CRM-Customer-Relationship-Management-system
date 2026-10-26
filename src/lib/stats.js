// Calculations for the Statistics page. Every note counts as one check-in.
const DAY = 24 * 60 * 60 * 1000;

export const periods = [
  { days: 30, label: 'Last 30 days', previous: 'the 30 days before' },
  { days: 90, label: 'Last quarter', previous: 'the quarter before' },
  { days: 365, label: 'Last year', previous: 'the year before' },
];

// Which firm someone was at when a note was written (falls back to where they are now).
function orgAt(contactId, at, employment, fallback) {
  const job = employment.find((e) => e.contactId === contactId && e.start <= at && (!e.end || e.end >= at));
  return job ? job.orgId : fallback;
}

export function allCheckins(contacts, employment) {
  return contacts.flatMap((c) =>
    c.notes.map((n) => ({ at: n.at, time: new Date(n.at).getTime(), contactId: c.id, orgId: orgAt(c.id, n.at, employment, c.orgId) })),
  );
}

function summarize(list, days) {
  return {
    count: list.length,
    perDay: list.length / days,
    people: new Set(list.map((x) => x.contactId)).size,
    firms: new Set(list.map((x) => x.orgId).filter(Boolean)).size,
  };
}

export function compare(checkins, days, now = Date.now()) {
  const start = now - days * DAY;
  const prevStart = now - 2 * days * DAY;
  const current = checkins.filter((x) => x.time > start && x.time <= now);
  const previous = checkins.filter((x) => x.time > prevStart && x.time <= start);
  return { current: summarize(current, days), previous: summarize(previous, days), currentList: current };
}

// Bars for the chart: daily for 30 days, weekly for a quarter, monthly for a year.
export function buckets(checkins, days, now = new Date()) {
  const out = [];
  if (days === 365) {
    for (let i = 11; i >= 0; i--) {
      const from = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const to = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);
      out.push({
        from,
        to,
        label: from.toLocaleDateString(undefined, { month: 'short' }),
        long: from.toLocaleDateString(undefined, { month: 'long', year: 'numeric' }),
      });
    }
  } else {
    const size = days === 30 ? 1 : 7;
    const n = days === 30 ? 30 : 13;
    const end = new Date(now);
    end.setHours(23, 59, 59, 999);
    for (let i = n - 1; i >= 0; i--) {
      const to = new Date(end.getTime() - i * size * DAY);
      const from = new Date(to.getTime() - size * DAY);
      const fmt = (d) => d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
      const first = new Date(from.getTime() + 1);
      out.push({
        from,
        to,
        label: fmt(first),
        long: size === 1 ? first.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }) : `Week of ${fmt(first)}`,
      });
    }
  }
  return out.map((b) => ({ ...b, count: checkins.filter((x) => x.time > b.from.getTime() && x.time <= b.to.getTime()).length }));
}

// Moves between firms, from work history: "from" job ended, next job started at another firm.
export function moves(employment) {
  const byPerson = {};
  employment.forEach((e) => (byPerson[e.contactId] ||= []).push(e));
  const pairs = {};
  Object.entries(byPerson).forEach(([contactId, jobs]) => {
    jobs.sort((a, b) => (a.start < b.start ? -1 : 1));
    for (let i = 1; i < jobs.length; i++) {
      const from = jobs[i - 1].orgId;
      const to = jobs[i].orgId;
      if (from === to) continue;
      const key = `${from}>${to}`;
      (pairs[key] ||= { from, to, people: [], last: jobs[i].start }).people.push(contactId);
      if (jobs[i].start > pairs[key].last) pairs[key].last = jobs[i].start;
    }
  });
  return Object.values(pairs).sort((a, b) => b.people.length - a.people.length || (a.last < b.last ? 1 : -1));
}

export function pctChange(now, before) {
  if (before === 0) return now === 0 ? 0 : null;
  return Math.round(((now - before) / before) * 100);
}
