/**
 * Ethiopian calendar (Amete Mihret) <-> Gregorian, via the Julian Day Number.
 * Copied verbatim from 03-Reference-data/ethiopian-calendar.mjs and
 * converted to TypeScript. Tested against Genna, Timket and both leap
 * New Year cases (see ethiopian-calendar.test.ts).
 *
 * Storage stays Gregorian ("YYYY-MM-DD" or ISO timestamps).
 * Convert only to show or pick dates.
 */

const ETH_EPOCH = 1724221; // JDN of Meskerem 1, year 1

function gToJdn(y: number, m: number, d: number): number {
  const a = Math.floor((14 - m) / 12), yy = y + 4800 - a, mm = m + 12 * a - 3;
  return d + Math.floor((153 * mm + 2) / 5) + 365 * yy + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400) - 32045;
}

function jdnToG(j: number): { y: number; m: number; d: number } {
  const a = j + 32044, b = Math.floor((4 * a + 3) / 146097), c = a - Math.floor((146097 * b) / 4);
  const d = Math.floor((4 * c + 3) / 1461), e = c - Math.floor((1461 * d) / 4), m = Math.floor((5 * e + 2) / 153);
  return { y: 100 * b + d - 4800 + Math.floor(m / 10), m: m + 3 - 12 * Math.floor(m / 10), d: e - Math.floor((153 * m + 2) / 5) + 1 };
}

const ethJdn = (y: number, m: number, d: number): number =>
  ETH_EPOCH + 365 * (y - 1) + Math.floor(y / 4) + 30 * (m - 1) + d - 1;

const pad = (n: number): string => String(n).padStart(2, '0');
const localYmd = (dt: Date): string => `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}-${pad(dt.getDate())}`;

export interface EthDate {
  y: number;
  m: number;
  d: number;
}

/** "YYYY-MM-DD" or ISO timestamp (local day) → { y, m, d } Ethiopian, or null */
export function toEth(s: string | null | undefined): EthDate | null {
  const str = String(s ?? '');
  const iso = str.length <= 10 ? str : localYmd(new Date(str));
  const [Y, M, D] = iso.slice(0, 10).split('-').map(Number);
  if (!Y || !M || !D) return null;
  const j = gToJdn(Y, M, D);
  let y = Math.floor((j - ETH_EPOCH) / 365.25) + 1;
  while (ethJdn(y + 1, 1, 1) <= j) y++;
  while (ethJdn(y, 1, 1) > j) y--;
  const n = j - ethJdn(y, 1, 1);
  return { y, m: Math.floor(n / 30) + 1, d: (n % 30) + 1 };
}

/** Ethiopian y, m (1-13), d → Gregorian "YYYY-MM-DD" */
export function fromEth(y: number, m: number, d: number): string {
  const g = jdnToG(ethJdn(y, m, d));
  return `${g.y}-${pad(g.m)}-${pad(g.d)}`;
}

/** Days in an Ethiopian month: 30, or Pagume 5 (6 when year % 4 === 3) */
export const ethMonthDays = (y: number, m: number): number => (m === 13 ? (y % 4 === 3 ? 6 : 5) : 30);

export const ETH_MONTHS: Record<string, string[]> = {
  en: ['Meskerem', 'Tikimt', 'Hidar', 'Tahsas', 'Tir', 'Yekatit', 'Megabit', 'Miyazya', 'Ginbot', 'Sene', 'Hamle', 'Nehase', 'Pagume'],
  am: ['መስከረም', 'ጥቅምት', 'ኅዳር', 'ታኅሣሥ', 'ጥር', 'የካቲት', 'መጋቢት', 'ሚያዝያ', 'ግንቦት', 'ሰኔ', 'ሐምሌ', 'ነሐሴ', 'ጳጉሜ'],
};

export const WEEKDAYS: Record<string, string[]> = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  am: ['እሑድ', 'ሰኞ', 'ማክሰኞ', 'ረቡዕ', 'ሐሙስ', 'ዓርብ', 'ቅዳሜ'],
};

/** dd/mm/yyyy in the Ethiopian calendar, e.g. "11/03/2019" */
export function dmy(s: string | null | undefined): string {
  const e = toEth(s);
  return e ? `${pad(e.d)}/${pad(e.m)}/${e.y}` : '';
}

export interface EthLongOpts {
  year?: boolean;
  weekday?: boolean;
  short?: boolean;
}

/** "Hidar 11, 2019 E.C." / "ኅዳር 11 ቀን 2019 ዓ.ም." */
export function ethLong(s: string | null | undefined, lang = 'en', opts: EthLongOpts = {}): string {
  const e = toEth(s);
  if (!e) return '';
  let mo = ETH_MONTHS[lang][e.m - 1];
  if (opts.short && lang === 'en') mo = mo.slice(0, 3);
  let out =
    lang === 'am'
      ? `${mo} ${e.d}${opts.year ? ` ቀን ${e.y} ዓ.ም.` : ''}`
      : `${mo} ${e.d}${opts.year ? `, ${e.y} E.C.` : ''}`;
  if (opts.weekday) {
    const wd = new Date(String(s).slice(0, 10) + 'T00:00:00').getDay();
    let w = WEEKDAYS[lang][wd];
    if (opts.short) w = lang === 'am' ? w.slice(0, 2) : w.slice(0, 3);
    out = `${w}${lang === 'am' ? '፣' : ','} ${out}`;
  }
  return out;
}

/** Ethiopian month range helpers */
export const monthStart = (s: string): string => { const e = toEth(s)!; return fromEth(e.y, e.m, 1); };
export const monthEnd = (s: string): string => { const e = toEth(s)!; return fromEth(e.y, e.m, ethMonthDays(e.y, e.m)); };
export const addMonths = (s: string, n: number): string => { const e = toEth(s)!; const k = e.y * 13 + (e.m - 1) + n; return fromEth(Math.floor(k / 13), (k % 13) + 1, 1); };
export const yearStart = (s: string): string => fromEth(toEth(s)!.y, 1, 1);
export const yearEnd = (s: string): string => { const y = toEth(s)!.y; return fromEth(y, 13, ethMonthDays(y, 13)); };

/** Add days to ISO date */
export function addDays(s: string, n: number): string {
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return localYmd(d);
}

/** Monday of the week containing date s */
export function weekStart(s: string): string {
  const d = new Date(s.slice(0, 10) + 'T00:00:00');
  const wd = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - wd);
  return localYmd(d);
}

/** Sunday of the week containing date s */
export function weekEnd(s: string): string {
  return addDays(weekStart(s), 6);
}

/** Month name helper */
export function ethMonthName(m: number, lang = 'en', short = false): string {
  const list = ETH_MONTHS[lang] || ETH_MONTHS.en;
  const name = list[m - 1] || '';
  if (short) {
    return lang === 'am' ? name.slice(0, 3) : name.slice(0, 3);
  }
  return name;
}

/** Today as "YYYY-MM-DD" */
export function todayIso(): string {
  return localYmd(new Date());
}

/** Relative date label — "Today", "Yesterday", "3d ago", etc. */
export function relativeDate(iso: string | null | undefined, lang = 'en'): string {
  if (!iso) return '';
  const today = localYmd(new Date());
  const diff = Math.round((new Date(today).getTime() - new Date(iso.slice(0, 10)).getTime()) / 86400000);
  if (lang === 'am') {
    if (diff === 0) return 'ዛሬ';
    if (diff === 1) return 'ትናንት';
    if (diff === -1) return 'ነገ';
    if (diff > 0 && diff < 7) return `ከ${diff} ቀን በፊት`;
    if (diff >= 7 && diff < 30) return `ከ${Math.round(diff / 7)} ሳምንት በፊት`;
    return dmy(iso);
  }
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  if (diff > 0 && diff < 7) return `${diff}d ago`;
  if (diff >= 7 && diff < 30) return `${Math.round(diff / 7)}w ago`;
  return dmy(iso);
}
