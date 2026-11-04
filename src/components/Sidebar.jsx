import Icon from './Icon.jsx';

const main = [
  { id: 'home', label: 'Home', icon: 'home' },
  { id: 'contacts', label: 'Contacts', icon: 'contacts' },
  { id: 'orgs', label: 'Organizations', icon: 'orgs' },
  { id: 'contracts', label: 'Contracts', icon: 'contracts' },
  { id: 'stats', label: 'Statistics', icon: 'stats' },
  { id: 'archived', label: 'Archived', icon: 'archived' },
];

const isMac = typeof window !== 'undefined' && window.crm?.platform === 'darwin';
export const shortcut = (key) => (isMac ? `⌘${key}` : `Ctrl+${key}`);

// collapsed: icons only, with the names as tooltips. Labels stay in the page for screen readers.
export default function Sidebar({ page, onNavigate, counts, theme, onToggleTheme, dataMode, canLock, collapsed, onToggleCollapsed }) {
  const tip = (text) => (collapsed ? text : undefined);
  const item = (it) => (
    <button
      key={it.id}
      className={'nav-item' + (page === it.id ? ' is-active' : '')}
      onClick={() => onNavigate(it.id)}
      aria-current={page === it.id ? 'page' : undefined}
      title={tip(counts[it.id] != null ? `${it.label} (${counts[it.id]})` : it.label)}
    >
      <Icon name={it.icon} />
      <span className="nav-label">{it.label}</span>
      {counts[it.id] != null && <span className="nav-count">{counts[it.id]}</span>}
    </button>
  );

  return (
    <aside className={'sidebar' + (collapsed ? ' is-collapsed' : '')}>
      <div className="brand">
        <div className="brand-mark" aria-hidden="true">C</div>
        <div className="brand-text">
          <div className="brand-name">Contractor CRM</div>
          <div className={'brand-sub' + (dataMode === 'database' ? '' : ' is-sample')}>
            {dataMode === 'database' ? 'Saved on this computer' : 'Sample data, not saved'}
          </div>
        </div>
      </div>

      {canLock && (
        <button
          className="lock-btn"
          onClick={() => window.crm.api.logout()}
          title={`Lock now (${shortcut('L')}). Your password opens it again.`}
        >
          <Icon name="lock" size={17} />
          <span className="nav-label">Lock</span>
          <kbd className="nav-count">{shortcut('L')}</kbd>
        </button>
      )}

      <nav className="nav">{main.map(item)}</nav>

      <div className="sidebar-foot">
        {item({ id: 'settings', label: 'Settings', icon: 'settings' })}
        <button
          className="theme-hint"
          onClick={onToggleTheme}
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          <Icon name={theme === 'dark' ? 'moon' : 'sun'} size={15} />
          <span className="nav-label">{theme === 'dark' ? 'Dark mode' : 'Light mode'}</span>
        </button>
        <button
          className="theme-hint collapse-btn"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          title={`${collapsed ? 'Expand' : 'Collapse'} sidebar (${shortcut('B')})`}
        >
          <Icon name="panel" size={15} />
          <span className="nav-label">Collapse sidebar</span>
        </button>
      </div>
    </aside>
  );
}
