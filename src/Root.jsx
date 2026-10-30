// Decides what opens first: the password screens, or the app.
//
// - Real database, locked (installed app, or `npm run dev`): create-password or sign-in screen.
// - Real database, unlocked: the app on real data.
// - Test database (`npm run dev:db`) or the browser preview: straight to the app, no login.
import { useEffect, useState } from 'react';
import App from './App.jsx';
import { SetupScreen, LoginScreen } from './pages/AuthScreens.jsx';
import { useSettingsState, useTheme } from './hooks/useSettings.js';

const crm = typeof window !== 'undefined' ? window.crm : undefined;
const WAS_UNLOCKED = 'crm-was-unlocked'; // only "was this window signed in", never data

const readFlag = () => {
  try { return sessionStorage.getItem(WAS_UNLOCKED) === '1'; } catch { return false; }
};
const setFlag = () => {
  try { sessionStorage.setItem(WAS_UNLOCKED, '1'); } catch {}
};

function initialScreen() {
  if (!crm || !crm.api || typeof crm.api.isSetUp !== 'function') return 'app';
  if (crm.dataMode !== 'sample') return 'app';
  return 'checking';
}

// Light/dark for the password screens (the app manages its own once it opens).
function Themed({ children }) {
  const [settings] = useSettingsState();
  useTheme(settings);
  return children;
}

export default function Root() {
  const [screen, setScreen] = useState(initialScreen);
  const [exploring, setExploring] = useState(false);

  useEffect(() => {
    if (crm && crm.dataMode === 'database') setFlag();
    if (screen !== 'checking') return;
    crm.api
      .isSetUp()
      .then((done) => setScreen(done ? 'login' : 'setup'))
      // Login is switched off for the test database: just open the app.
      .catch(() => setScreen('app'));
  }, [screen]);

  const explore = () => {
    setExploring(true);
    setScreen('app');
  };

  if (screen === 'checking') return <Themed><main className="auth-screen" aria-busy="true" /></Themed>;
  if (screen === 'setup') return <Themed><SetupScreen onExplore={explore} /></Themed>;
  if (screen === 'login') return <Themed><LoginScreen onExplore={explore} locked={readFlag()} /></Themed>;
  return <App exploring={exploring} canLock={!!crm && crm.dataMode === 'database'} />;
}
