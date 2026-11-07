// Contact names. Prefix, middle name and suffix are optional (issue #40).
const part = (s) => String(s || '').trim();

// "Dr. Marcus James Hale III": the full name, for the profile and the contact cards.
export const formalName = (c) =>
  [c.prefix, c.firstName, c.middleName, c.lastName, c.suffix].map(part).filter(Boolean).join(' ');

// "Marcus Hale": for tables, lists, menus and messages, where the full name would crowd.
export const shortName = (c) => [c.firstName, c.lastName].map(part).filter(Boolean).join(' ');

// Suggestions only; any text is allowed.
export const PREFIXES = ['Mr.', 'Ms.', 'Mrs.', 'Mx.', 'Dr.', 'Capt.', 'Col.', 'Lt.', 'Maj.', 'Sgt.', 'Gen.', 'Rev.'];
export const SUFFIXES = ['Jr.', 'Sr.', 'II', 'III', 'IV', 'PhD', 'MD', 'Esq.', 'Ret.'];
