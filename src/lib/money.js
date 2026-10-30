// Contract values are whole dollars, or null when the value isn't known yet.
export const money = (n) =>
  n == null ? '—' : n.toLocaleString(undefined, { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
