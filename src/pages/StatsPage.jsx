import { useMemo, useState } from 'react';
import BarChart from '../components/BarChart.jsx';
import { periods, allCheckins, compare, buckets, moves, pctChange } from '../lib/stats.js';
import { lastContacted, daysSince, formatDate } from '../lib/freshness.js';

function Change({ now, before, unit, previous }) {
  const pct = pctChange(now, before);
  if (pct === null) return <p className="tile-change">New this period, none in {previous}</p>;
  if (pct === 0) return <p className="tile-change">Same as {previous}</p>;
  return (
    <p className={'tile-change ' + (pct > 0 ? 'is-up' : 'is-down')}>
      <span aria-hidden="true">{pct > 0 ? '▲' : '▼'}</span> {Math.abs(pct)}% vs {previous}
      <span className="muted"> ({before} {unit})</span>
    </p>
  );
}

export default function StatsPage({ contacts, orgsById, employment, onOpen }) {
  const [days, setDays] = useState(90);
  const [quietDays, setQuietDays] = useState(60);
  const [showTable, setShowTable] = useState(false);
  const period = periods.find((p) => p.days === days);

  const checkins = useMemo(() => allCheckins(contacts, employment), [contacts, employment]);
  const cmp = useMemo(() => compare(checkins, days), [checkins, days]);
  const bars = useMemo(() => buckets(checkins, days), [checkins, days]);
  const flows = useMemo(() => moves(employment), [employment]);

  // Previous period's average per bar, drawn as a dashed line for comparison.
  const prevPerBar = bars.length ? cmp.previous.count / bars.length : 0;
  const avg = (n) => (n < 1 ? n.toFixed(2) : n.toFixed(1));
  const barUnit = days === 30 ? 'day' : days === 90 ? 'week' : 'month';

  const quiet = contacts
    .filter((c) => c.status === 'active')
    .map((c) => {
      const last = lastContacted(c);
      return { c, last, days: last ? daysSince(last) : null };
    })
    .filter((x) => x.days === null || x.days >= quietDays)
    .sort((a, b) => (b.days ?? Infinity) - (a.days ?? Infinity));

  const name = (id) => {
    const c = contacts.find((x) => x.id === id);
    return c ? `${c.firstName} ${c.lastName}` : 'Unknown';
  };
  const orgName = (id) => (id ? orgsById[id]?.name || 'Unknown firm' : 'Independent');

  return (
    <>
      <header className="page-head">
        <div>
          <h1>Statistics</h1>
          <p className="page-sub">Every note you add counts as one check-in.</p>
        </div>
        <div className="segmented" role="group" aria-label="Time period">
          {periods.map((p) => (
            <button key={p.days} className={p.days === days ? 'is-on' : ''} aria-pressed={p.days === days} onClick={() => setDays(p.days)}>
              {p.label}
            </button>
          ))}
        </div>
      </header>

      <div className="tiles">
        <div className="tile">
          <p className="tile-label">Check-ins</p>
          <p className="tile-value">{cmp.current.count}</p>
          <Change now={cmp.current.count} before={cmp.previous.count} unit="check-ins" previous={period.previous} />
        </div>
        <div className="tile">
          <p className="tile-label">Average per day</p>
          <p className="tile-value">{avg(cmp.current.perDay)}</p>
          <p className="tile-change">{period.previous[0].toUpperCase() + period.previous.slice(1)}: {avg(cmp.previous.perDay)} per day</p>
        </div>
        <div className="tile">
          <p className="tile-label">People reached</p>
          <p className="tile-value">{cmp.current.people}</p>
          <Change now={cmp.current.people} before={cmp.previous.people} unit="people" previous={period.previous} />
        </div>
        <div className="tile">
          <p className="tile-label">Firms reached</p>
          <p className="tile-value">{cmp.current.firms}</p>
          <Change now={cmp.current.firms} before={cmp.previous.firms} unit="firms" previous={period.previous} />
        </div>
      </div>

      <section className="panel stat-panel">
        <div className="panel-head">
          <h2>Check-ins per {barUnit}, {period.label.toLowerCase()}</h2>
          <button className="link-btn" onClick={() => setShowTable(!showTable)}>{showTable ? 'Show chart' : 'Show as table'}</button>
        </div>
        {showTable ? (
          <div className="table-wrap flat">
            <table className="table">
              <thead><tr><th>{barUnit[0].toUpperCase() + barUnit.slice(1)}</th><th className="num">Check-ins</th></tr></thead>
              <tbody>
                {[...bars].reverse().map((b, i) => (
                  <tr key={i}><td>{b.long}</td><td className="num">{b.count}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <BarChart data={bars} reference={prevPerBar} referenceLabel={`Average in ${period.previous}: ${prevPerBar.toFixed(1)} per ${barUnit}`} />
        )}
      </section>

      <div className="stat-columns">
        <section className="panel stat-panel">
          <div className="panel-head">
            <h2>Not contacted in</h2>
            <label className="days-input">
              <input type="number" min="1" value={quietDays} onChange={(e) => setQuietDays(Math.max(1, Number(e.target.value) || 1))} aria-label="Days" />
              <span className="muted">days</span>
            </label>
          </div>
          {quiet.length === 0 ? (
            <p className="muted">Everyone's been contacted in the last {quietDays} days.</p>
          ) : (
            <>
              <p className="muted small">{quiet.length} {quiet.length === 1 ? 'person' : 'people'}, longest gap first.</p>
              <ul className="people-list">
                {quiet.map(({ c, last, days: d }) => (
                  <li key={c.id}>
                    <button className="link-btn" onClick={() => onOpen(c.id)}>{c.firstName} {c.lastName}</button>
                    <span className="muted small">
                      {orgName(c.orgId)}, {last ? `last ${formatDate(last)} (${d} days)` : 'never contacted'}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>

        <section className="panel stat-panel">
          <div className="panel-head">
            <h2>Moves between firms</h2>
          </div>
          {flows.length === 0 ? (
            <p className="muted">No one has moved between firms yet. Moves show up here when you change someone's organization.</p>
          ) : (
            <>
              <p className="muted small">From work history, most common first.</p>
              <ul className="flow-list">
                {flows.map((f) => (
                  <li key={`${f.from}>${f.to}`}>
                    <div className="flow">
                      <span>{orgName(f.from)}</span>
                      <span className="flow-arrow" aria-label="to">→</span>
                      <span>{orgName(f.to)}</span>
                      <span className="flow-count">{f.people.length}</span>
                    </div>
                    <p className="muted small">{f.people.map(name).join(', ')}. Latest {formatDate(f.last)}.</p>
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </div>
    </>
  );
}
