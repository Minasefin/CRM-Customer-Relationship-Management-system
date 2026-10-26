import { useState } from 'react';

// "Sort by" dropdown. Remembers the last choice for each page on this computer.
export function useSort(key, options) {
  const storageKey = `crm.sort.${key}`;
  const [value, setValue] = useState(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      if (options.some((o) => o.id === saved)) return saved;
    } catch {}
    return options[0].id;
  });
  const set = (v) => {
    setValue(v);
    try {
      localStorage.setItem(storageKey, v);
    } catch {}
  };
  return [value, set];
}

export default function SortSelect({ value, onChange, options }) {
  return (
    <label className="sort-select">
      <span>Sort by</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
    </label>
  );
}
