import { useSettings } from '../hooks/useSettings.js';

// Contacts pinned to the Home page. Only their ids are kept, in this computer's settings.
export function usePins() {
  const [settings, update] = useSettings();
  const pinned = Array.isArray(settings.pinned) ? settings.pinned : [];
  const isPinned = (id) => pinned.includes(id);
  const togglePin = (id) => update({ pinned: isPinned(id) ? pinned.filter((x) => x !== id) : [...pinned, id] });
  return { pinned, isPinned, togglePin };
}
