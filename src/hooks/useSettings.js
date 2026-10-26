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

// Applies the theme to <html data-theme>. Re-checks every minute in auto mode.
export function useTheme(settings) {
  const pick = () =>
    settings.autoTheme
      ? themeForHour(new Date().getHours(), settings.lightFrom, settings.darkFrom)
      : settings.manualTheme;
  const [theme, setTheme] = useState(pick);

  useEffect(() => {
    setTheme(pick());
    if (!settings.autoTheme) return;
    const t = setInterval(() => setTheme(pick()), 60 * 1000);
    return () => clearInterval(t);
  }, [settings.autoTheme, settings.lightFrom, settings.darkFrom, settings.manualTheme]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  return theme;
}
