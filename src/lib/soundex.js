// American Soundex: turns a name into a 4-character code based on how it sounds,
// so names spelled differently but pronounced alike match.
//   soundex('Smith') === soundex('Smyth') === 'S530'
//   soundex('Robert') === soundex('Rupert') === 'R163'
// Rules: keep the first letter, code the rest (b f p v=1, c g j k q s x z=2, d t=3,
// l=4, m n=5, r=6), drop vowels and y, h, w, merge repeated codes (including across
// h and w, and with the first letter), then pad or cut to 4 characters.
const CODES = { b: 1, f: 1, p: 1, v: 1, c: 2, g: 2, j: 2, k: 2, q: 2, s: 2, x: 2, z: 2, d: 3, t: 3, l: 4, m: 5, n: 5, r: 6 };

export function soundex(name) {
  const letters = String(name || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // é -> e
    .toLowerCase()
    .replace(/[^a-z]/g, '');
  if (!letters) return '';

  let out = letters[0].toUpperCase();
  let last = CODES[letters[0]] || 0;
  for (let i = 1; i < letters.length && out.length < 4; i++) {
    const ch = letters[i];
    const code = CODES[ch];
    if (code) {
      if (code !== last) out += code;
      last = code;
    } else if (ch !== 'h' && ch !== 'w') {
      last = 0; // a vowel separates repeated codes; h and w don't
    }
  }
  return out.padEnd(4, '0');
}

// True when a typed word sounds like a name (both at least 2 letters).
export function soundsLike(word, name) {
  const a = String(word || '').replace(/[^a-z]/gi, '');
  const b = String(name || '').replace(/[^a-z]/gi, '');
  if (a.length < 2 || b.length < 2) return false;
  return soundex(a) === soundex(b);
}
