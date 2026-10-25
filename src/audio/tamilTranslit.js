/**
 * Latin-script player names -> Tamil script, so the Tamil Piper voice reads them with Tamil phonetics
 * (Latin input gets an English accent). Rule-based and tuned for Indian names as people usually type
 * them (Karthik, Priya, Lakshmi Narayanan); other names get a reasonable phonetic spelling.
 * Text that is already Tamil (or has no Latin letters) is returned unchanged.
 */
const VOWELS = {
  // independent, sign
  a: ['அ', ''],
  aa: ['ஆ', 'ா'],
  i: ['இ', 'ி'],
  ee: ['ஈ', 'ீ'],
  ii: ['ஈ', 'ீ'],
  u: ['உ', 'ு'],
  oo: ['ஊ', 'ூ'],
  uu: ['ஊ', 'ூ'],
  e: ['எ', 'ெ'],
  E: ['ஏ', 'ே'], // long e (internal)
  ai: ['ஐ', 'ை'],
  ay: ['ஐ', 'ை'],
  ei: ['ஏ', 'ே'],
  o: ['ஓ', 'ோ'],
  ou: ['ஔ', 'ௌ'],
  au: ['ஔ', 'ௌ'],
};
const VIRAMA = '்';
// longest first
const CONS = [
  ['ksh', 'க்ஷ'], ['chh', 'ச'], ['sch', 'ஷ'],
  ['ch', 'ச'], ['sh', 'ஷ'], ['zh', 'ழ'], ['th', 'த'], ['dh', 'த'], ['kh', 'க'], ['gh', 'க'], ['bh', 'ப'], ['ph', 'ஃப'], ['jh', 'ஜ'], ['ck', 'க'], ['ng', 'ங'],
  ['k', 'க'], ['g', 'க'], ['j', 'ஜ'], ['t', 'ட'], ['d', 'ட'], ['n', 'ன'], ['p', 'ப'], ['b', 'ப'], ['m', 'ம'], ['y', 'ய'], ['r', 'ர'],
  ['l', 'ல'], ['v', 'வ'], ['w', 'வ'], ['s', 'ஸ'], ['h', 'ஹ'], ['f', 'ஃப'], ['z', 'ஸ'], ['q', 'க'], ['c', 'க'], ['x', 'X'],
];
const VOWEL_KEYS = ['aa', 'ee', 'ii', 'oo', 'uu', 'ai', 'ay', 'ei', 'ou', 'au', 'a', 'i', 'u', 'e', 'o'];
const LETTERS = {
  a: 'ஏ', b: 'பி', c: 'சி', d: 'டி', e: 'ஈ', f: 'எஃப்', g: 'ஜி', h: 'ஹெச்', i: 'ஐ', j: 'ஜே', k: 'கே', l: 'எல்', m: 'எம்',
  n: 'என்', o: 'ஓ', p: 'பி', q: 'க்யூ', r: 'ஆர்', s: 'எஸ்', t: 'டி', u: 'யூ', v: 'வி', w: 'டபிள்யூ', x: 'எக்ஸ்', y: 'ஒய்', z: 'இஸட்',
};

const isV = (c) => /[aeiou]/.test(c || '');

/** Split a lowercase Latin word into vowel / consonant units. */
function tokenize(w) {
  const out = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    // y after a consonant or at the end of a word acts as a vowel (Zoey, Lucy, Vicky)
    if (rest[0] === 'y' && out.length && out[out.length - 1].t === 'c' && !isV(rest[1])) {
      out.push({ t: 'v', k: 'i', s: 'y' });
      i += 1;
      continue;
    }
    if (rest[0] === 'y' && i === w.length - 1 && out.length) {
      out.push({ t: 'v', k: 'i', s: 'y' });
      i += 1;
      continue;
    }
    const v = VOWEL_KEYS.find((k) => rest.startsWith(k) && !(k === 'ay' && isV(rest[2])));
    if (v) {
      out.push({ t: 'v', k: v, s: v });
      i += v.length;
      continue;
    }
    const c = CONS.find(([k]) => rest.startsWith(k));
    if (c) {
      out.push({ t: 'c', k: c[0], s: c[1] });
      i += c[0].length;
      continue;
    }
    i += 1; // unknown char: skip
  }
  return out;
}

function word(w) {
  if (w.length === 1 && LETTERS[w]) return LETTERS[w];
  // silent final e after a consonant (Mike, Grace); keep it for very short words (Zoe -> Zo-e)
  const magicE = w.length > 3 && /[aiou][^aeiouy]e$/.test(w);
  if (w.length > 3 && /ce$/.test(w)) w = w.replace(/ce$/, 'se'); // Grace, Lance
  if (w.length > 3 && /[^aeiou]e$/.test(w)) w = w.slice(0, -1);
  if (/[aeiou]h$/.test(w)) w = w.slice(0, -1); // Farah, Sarah
  w = w.replace(/([aeiou])h(?=[^aeiouy])/g, '$1'); // John
  const T = tokenize(w);
  if (magicE) { // Mike -> மைக், Grace -> கிரேஸ்
    const v = [...T].reverse().find((x) => x.t === 'v');
    if (v && v.k === 'i') v.k = 'ai';
    else if (v && v.k === 'a') v.k = 'E';
  }
  if (T.length > 2 && T[0].k === 'i' && T[1].k === 'y' && T[2].t === 'v') T[0].k = 'ai'; // Iyer -> ஐயர்
  const Tl = T.length;
  if (Tl > 2 && T[Tl - 1].k === 'r' && T[Tl - 2].k === 'e') T[Tl - 2].k = 'a'; // Alexander, Player
  if (Tl > 1 && T[Tl - 1].k === 'e' && T[Tl - 2].t === 'v') { T[Tl - 1].k = 'i'; T.splice(Tl - 1, 0, { t: 'c', k: 'y', s: 'ய' }); } // Zoe
  let glide = false;
  let out = '';
  for (let i = 0; i < T.length; i++) {
    const cur = T[i];
    const prev = T[i - 1];
    const next = T[i + 1];
    const next2 = T[i + 2];
    if (cur.t === 'v') {
      let k = cur.k;
      const last = i === T.length - 1;
      if (k === 'a' && last && prev) k = 'aa'; // Priya, Meena, Divya
      if (k === 'a' && next?.k === 'r' && next2?.t === 'c' && prev) k = 'aa'; // Karthik, Parthiban
      // e before a single consonant then a vowel / the end is usually long (Suresh, Ramesh, Venu) - Venkat stays short
      if (k === 'e' && next?.t === 'c' && next.k !== 'x' && (!next2 || next2.t === 'v')) k = 'E';
      if (k === 'e' && last && prev) k = 'E';
      if (k === 'o' && next?.k === 'w' && !next2) { out += prev ? 'ோ' : 'ஓ'; i += 1; continue; } // Bartholomew handled below
      // glide between i and a following vowel (Maximilian -> ...லியன், Priya already has y)
      const sign = (prev && prev.t === 'c') || glide;
      glide = false;
      out += sign ? VOWELS[k][1] : VOWELS[k][0];
      if (['i', 'ee', 'e', 'E'].includes(k) && next?.t === 'v') { out += 'ய'; glide = true; }
      continue;
    }
    // consonant
    let s = cur.s;
    const atStart = i === 0;
    if (cur.k === 'ew') s = 'யூ';
    if (cur.k === 'n') {
      if (atStart) s = 'ந';
      else if (next && ['t', 'd'].includes(next.k)) s = 'ண';
      else if (next && ['th', 'dh'].includes(next.k)) s = 'ந';
      else if (next && ['k', 'g', 'kh', 'gh'].includes(next.k)) s = 'ங';
    }
    if (cur.k === 'ng') s = next && next.t === 'v' ? 'ங்க' : 'ங்';
    if (cur.k === 'd' && (atStart || next?.k === 'r')) s = 'த'; // Divya, Deepa, Chandra
    if (cur.k === 'n' && next?.k === 'd' && T[i + 2]?.k === 'r') s = 'ந';
    if (cur.k === 's' && !atStart && prev?.t === 'v' && next?.t === 'v') s = 'ச'; // Vasanth, Sekhar
    if (cur.k === 's' && atStart && next?.t === 'v') s = 'ச'; // Suresh, Saravanan
    if (cur.k === 'c' && next && /^[eiy]/.test(next.k)) s = 'ஸ';
    if (cur.k === 'x') s = 'க்ஸ';
    if (cur.k === 'th' && prev?.k === 'r') s = 'த்த'; // Karthik -> கார்த்திக்
    if (cur.k === 'w' && prev?.k === 'e' && !next) { out = out.replace(/[ெே]$/, ''); out += 'ியூ'; continue; } // -mew
    // initial cluster + r/l gets a helping i (Priya -> பிரியா, Krishna -> கிருஷ்ணா-ish)
    out += s;
    if (s.endsWith('்')) continue;
    if (!next || next.t === 'c') {
      if (next && ['r', 'l'].includes(next.k) && next2?.t === 'v' && (atStart || ['d', 't', 'th', 'dh', 'k', 'p', 'b', 'g'].includes(cur.k))) out += 'ி';
      else out += VIRAMA;
    }
  }
  return out;
}

// Common South-Asian names whose long vowels / retroflex consonants English spelling hides
// (Narayanan is நாராயணன், not நரயனன்). Checked before the rules; keys are lowercase words.
const KNOWN = {
  narayanan: 'நாராயணன்', narayan: 'நாராயண்', gopal: 'கோபால்', raghavan: 'ராகவன்', venkataraghavan: 'வெங்கடராகவன்',
  subramaniam: 'சுப்பிரமணியம்', subramanian: 'சுப்பிரமணியன்', lakshmi: 'லட்சுமி', krishnan: 'கிருஷ்ணன்', krishna: 'கிருஷ்ணா',
  kumar: 'குமார்', ramesh: 'ரமேஷ்', rajesh: 'ராஜேஷ்', raja: 'ராஜா', ram: 'ராம்', rama: 'ராமா', rani: 'ராணி',
  ganesh: 'கணேஷ்', ganesan: 'கணேசன்', murugan: 'முருகன்', senthil: 'செந்தில்', selvam: 'செல்வம்', saravanan: 'சரவணன்',
  balaji: 'பாலாஜி', bala: 'பாலா', vijay: 'விஜய்', ajith: 'அஜித்', prakash: 'பிரகாஷ்', anand: 'ஆனந்த்', arun: 'அருண்',
  kannan: 'கண்ணன்', mani: 'மணி', vani: 'வாணி', meenakshi: 'மீனாட்சி', kamala: 'கமலா', geetha: 'கீதா', sita: 'சீதா',
  karthika: 'கார்த்திகா', nandhini: 'நந்தினி', nandini: 'நந்தினி', shankar: 'சங்கர்', dhanush: 'தனுஷ்', prince: 'பிரின்ஸ்',
};

export function toTamilScript(name) {
  const s = String(name || '').trim();
  if (!/[A-Za-z]/.test(s)) return s;
  return s
    .split(/([^A-Za-z]+)/)
    .map((part) => (/^[A-Za-z]+$/.test(part) ? KNOWN[part.toLowerCase()] || word(part.toLowerCase()) : part.replace(/[-_.]+/g, ' ')))
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
}
