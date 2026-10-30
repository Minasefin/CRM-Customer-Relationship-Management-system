import Icon from './Icon.jsx';

const main = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'contacts', label: 'Contacts', icon: 'contacts' },
  { id: 'orgs', label: 'Organizations', icon: 'orgs' },
  { id: 'contracts', label: 'Contracts', icon: 'contracts' },
  { id: 'stats', label: 'Statistics', icon: 'stats' },
  { id: 'archived', label: 'Archived', icon: 'archived' },
];

export default function Sidebar({ page, onNavigate, counts, theme, onToggleTheme, dataMode, canLock }) {
  const item = (it) => (
    <button
      key={it.id}
      className={'nav-item' + (page === it.id ? ' is-active' : '')}
      onClick={() => onNavigate(it.id)}
      aria-current={page === it.id ? 'page' : undefined}
    >
      <Icon name={it.icon} />
      <span>{it.label}</span>
      {counts[it.id] != null && <span className="nav-count">{counts[it.id]}</span>}
    </button>
  );

  return (
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div>
          <div className="brand-name">Contractor CRM</div>
          <div className={'brand-sub' + (dataMode === 'database' ? '' : ' is-sample')}>
            {dataMode === 'database' ? 'Saved on this computer' : 'Sample data, not saved'}
          </div>
        </div>
      </div>
      <nav className="nav">{main.map(item)}</nav>
      <div className="sidebar-foot">
        {item({ id: 'settings', label: 'Settings', icon: 'settings' })}
        {canLock && (
          <button className="nav-item" onClick={() => window.crm.api.logout()} title="Lock now. Your password opens it again.">
            <Icon name="lock" />
            <span>Lock</span>
          </button>
        )}
        <button
          className="theme-hint"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
          {theme === 'dark' ? 'Dark mode' : 'Light mode'}
        </button>
      </div>
    </aside>
  );
}
