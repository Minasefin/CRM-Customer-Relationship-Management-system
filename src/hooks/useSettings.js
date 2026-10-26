import { createContext, useContext, useEffect, useState } from 'react';

const KEY = 'crm.settings';
export const defaultSettings = {
  autoTheme: true, // switch light/dark by time of day
  lightFrom: 7, // light mode starts at 7 AM
  darkFrom: 19, // dark mode starts at 7 PM
  manualTheme: 'light', // used when autoTheme is off
  staleAfter: 30,
  overdueAfter: 90,
};

function load() {
  try {
    return { ...defaultSettings, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return defaultSettings;
  }
}

export const SettingsContext = createContext(null);

export function useSettingsState() {
  const [settings, setSettings] = useState(load);
  const update = (patch) =>
    setSettings((s) => {
      const next = { ...s, ...patch };
      try {
        localStorage.setItem(KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  return [settings, update];
}

export function useSettings() {
  return useContext(SettingsContext);
}

function themeForHour(hour, lightFrom, darkFrom) {
  return hour >= lightFrom && hour < darkFrom ? 'light' : 'dark';
}

// When the next scheduled switch happens (the next lightFrom or darkFrom hour).
export function nextSwitch(lightFrom, darkFrom, from = new Date()) {
  const candidates = [lightFrom, darkFrom].flatMap((h) => {
    const today = new Date(from);
    today.setHours(h, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    return [today, tomorrow];
  });
  return candidates.filter((d) => d > from).sort((a, b) => a - b)[0].toISOString();
}

// Picks the theme: a sidebar override wins until the next scheduled switch,
// then the time-of-day schedule takes over again.
function pickTheme(s) {
  if (!s.autoTheme) return s.manualTheme;
  if (s.override && new Date(s.override.until) > new Date()) return s.override.theme;
  return themeForHour(new Date().getHours(), s.lightFrom, s.darkFrom);
}

// Applies the theme to <html data-theme>. Re-checks every minute in auto mode.
export function useTheme(settings) {
  const pick = () => pickTheme(settings);
  const [theme, setTheme] = useState(pick);

  useEffect(() => {
    setTheme(pick());
    if (!settings.autoTheme) return;
    const t = setInterval(() => setTheme(pick()), 60 * 1000);
    return () => clearInterval(t);
  }, [settings.autoTheme, settings.lightFrom, settings.darkFrom, settings.manualTheme, settings.override?.until, settings.override?.theme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}
