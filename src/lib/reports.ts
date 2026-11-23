import ExcelJS from 'exceljs';
import type { Student, Lead, Activity, Settings } from '../types';
import {
  todayIso,
  toEth,
  dmy,
  ethLong,
  monthStart,
  monthEnd,
  addMonths,
  yearStart,
  yearEnd,
  weekStart,
  weekEnd,
  addDays,
  ethMonthName
} from './ethiopian-calendar';
import { STAGES_LIST, STAGE_INDEX } from './sample-data';
import { LEAD_OUTCOMES, CLOSE_REASONS, PACKAGE_LABEL } from './reference-data';

export type ReportDatasetKey = 'leads' | 'calls' | 'students' | 'moves' | 'payments' | 'visas';

export const DATASETS: ReportDatasetKey[] = ['leads', 'calls', 'students', 'moves', 'payments', 'visas'];

export interface DatasetInfo {
  key: ReportDatasetKey;
  label: string;
  desc: string;
  icon: string;
}

export const DATASET_INFO: Record<ReportDatasetKey, DatasetInfo> = {
  leads: { key: 'leads', label: 'Enquiries', desc: 'Every new lead logged: name, phone, source, interest, status and calls made', icon: 'chat' },
  calls: { key: 'calls', label: 'Calls made', desc: 'Every follow-up call: when, outcome, note and who called', icon: 'phone' },
  students: { key: 'students', label: 'New students', desc: 'Cases opened: destination, university, package, funding and officer', icon: 'users' },
  moves: { key: 'moves', label: 'Step moves', desc: 'Every time a case moved from one step to the next', icon: 'right' },
  payments: { key: 'payments', label: 'Payments', desc: 'Every payment recorded: date, student, which payment and amount', icon: 'money' },
  visas: { key: 'visas', label: 'Visa decisions', desc: 'Approved, refused and additional documents requested', icon: 'plane' }
};

export interface ResolvedRange {
  key: string;
  from: string;
  to: string;
  label: string;
  plain: string;
}

export function dateOf(iso?: string | null): string {
  if (!iso) return '';
  const s = String(iso);
  if (s.length <= 10) return s;
  const d = new Date(s);
  return isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
}

export function resolveReportRange(key: string, from?: string, to?: string, lang: 'en' | 'am' = 'en'): ResolvedRange {
  const today = todayIso();
  let f = today;
  let t = today;

  switch (key) {
    case 'today':
      f = today;
      t = today;
      break;
    case 'week':
      f = weekStart(today);
      t = weekEnd(today);
      break;
    case 'lastWeek': {
      const prevMon = addDays(weekStart(today), -7);
      f = prevMon;
      t = addDays(prevMon, 6);
      break;
    }
    case 'month':
      f = monthStart(today);
      t = monthEnd(today);
      break;
    case 'lastMonth': {
      const prevM = addMonths(today, -1);
      f = monthStart(prevM);
      t = monthEnd(prevM);
      break;
    }
    case 'year':
      f = yearStart(today);
      t = yearEnd(today);
      break;
    case 'custom':
      f = from || monthStart(today);
      t = to || today;
      if (f > t) {
        const tmp = f;
        f = t;
        t = tmp;
      }
      break;
    default:
      break;
  }

  const label =
    f === t
      ? ethLong(f, lang, { weekday: true, short: true, year: true })
      : `${ethLong(f, lang, { year: toEth(f)?.y !== toEth(t)?.y, short: true })} – ${ethLong(t, lang, { year: true, short: true })}`;
  const plain = f === t ? dmy(f) : `${dmy(f)} to ${dmy(t)}`;

  return { key, from: f, to: t, label, plain };
}

export interface ReportTable {
  key: ReportDatasetKey;
  name: string;
  columns: string[];
  types: Array<'t' | 'd' | 'n' | 'm'>;
  rows: Array<Array<string | number>>;
}

export interface ReportSummary {
  leads: number;
  calls: number;
  answered: number;
  students: number;
  moves: number;
  payments: number;
  collected: number;
  approved: number;
  refused: number;
  additional: number;
  closed: number;
  converted: number;
  bySource: Array<[string, number]>;
  byDest: Array<[string, number]>;
  byOfficer: Array<[string, { calls: number; moves: number; students: number }]>;
  newNames: string[];
}

export function cellText(val: any, type: 't' | 'd' | 'n' | 'm'): string {
  if (val === undefined || val === null || val === '') return '';
  if (type === 'd') return dmy(String(val));
  if (type === 'm') return `${Number(val).toLocaleString()} ETB`;
  if (type === 'n') return Number(val).toLocaleString();
  return String(val);
}

export function buildReport(
  students: Student[],
  leads: Lead[],
  activities: Activity[],
  from: string,
  to: string,
  include: ReportDatasetKey[],
  _lang: 'en' | 'am' = 'en',
  tFn?: (k: string, opts?: any) => string
): { tables: ReportTable[]; summary: ReportSummary } {
  const t = tFn || ((s: string) => s);
  const within = (iso?: string | null) => {
    const d = dateOf(iso);
    return !!d && d >= from && d <= to;
  };

  // 1. Leads
  const leadsIn = leads
    .filter(l => within(l.created_at))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  // 2. Calls
  const calls: Array<{ call: any; lead: Lead }> = [];
  leads.forEach(l => {
    (l.calls || []).forEach(c => {
      if (within(c.ts)) {
        calls.push({ call: c, lead: l });
      }
    });
  });
  calls.sort((a, b) => (a.call.ts || '').localeCompare(b.call.ts || ''));

  // 3. New Students
  const newStu = students
    .filter(s => within(s.created_at))
    .sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));

  // 4. Stage Moves
  const moves: Array<{ student: Student; text: string; from: string; to: string; ts: string; author: string }> = [];
  activities.forEach(a => {
    if (a.kind === 'stage' && within(a.ts)) {
      const match = (a.text || '').match(/Moved from (.+) to (.+)/i);
      const stu = students.find(s => s.id === a.student_id);
      if (match && stu) {
        moves.push({
          student: stu,
          text: a.text,
          from: match[1],
          to: match[2],
          ts: a.ts,
          author: a.author_name || 'System'
        });
      }
    }
  });
  moves.sort((a, b) => (a.ts || '').localeCompare(b.ts || ''));

  // 5. Payments
  const pays: Array<{ student: Student; kind: string; amount: number; paid_on: string }> = [];
  students.forEach(s => {
    (s.payments || []).forEach(p => {
      if (p.paid && within(p.paid_on)) {
        pays.push({
          student: s,
          kind: p.kind,
          amount: Number(p.amount) || 0,
          paid_on: p.paid_on || ''
        });
      }
    });
  });
  pays.sort((a, b) => (a.paid_on || '').localeCompare(b.paid_on || ''));

  // 6. Visas
  const visas = students
    .filter(s => s.decision && within(s.decided_at || s.updated_at))
    .sort((a, b) => (a.decided_at || a.updated_at || '').localeCompare(b.decided_at || b.updated_at || ''));

  // Summary tallies
  const closed = leads.filter(l => l.status === 'closed' && within(l.updated_at)).length;
  const destName = (s: Student) => s.strategy_country || s.target_countries?.[0] || 'Not set';

  // Group by Source
  const srcMap = new Map<string, number>();
  leadsIn.forEach(l => {
    const k = l.source || 'Unknown';
    srcMap.set(k, (srcMap.get(k) || 0) + 1);
  });
  const bySource: Array<[string, number]> = [...srcMap.entries()].sort((a, b) => b[1] - a[1]);

  // Group by Destination
  const destMap = new Map<string, number>();
  newStu.forEach(s => {
    const k = destName(s);
    destMap.set(k, (destMap.get(k) || 0) + 1);
  });
  const byDest: Array<[string, number]> = [...destMap.entries()].sort((a, b) => b[1] - a[1]);

  // Group by Officer
  const officerMap = new Map<string, { calls: number; moves: number; students: number }>();
  const bumpOfficer = (name: string, field: 'calls' | 'moves' | 'students') => {
    const key = name || t('Not assigned');
    const entry = officerMap.get(key) || { calls: 0, moves: 0, students: 0 };
    entry[field]++;
    officerMap.set(key, entry);
  };

  calls.forEach(({ call }) => bumpOfficer(call.author_name || call.author, 'calls'));
  moves.forEach(m => bumpOfficer(m.author, 'moves'));
  newStu.forEach(s => bumpOfficer(s.officer || '', 'students'));

  const byOfficer = [...officerMap.entries()].sort(
    (a, b) => b[1].calls + b[1].moves + b[1].students - (a[1].calls + a[1].moves + a[1].students)
  );

  const summary: ReportSummary = {
    leads: leadsIn.length,
    calls: calls.length,
    answered: calls.filter(({ call }) => call.outcome === 'answered').length,
    students: newStu.length,
    moves: moves.length,
    payments: pays.length,
    collected: pays.reduce((sum, p) => sum + p.amount, 0),
    approved: visas.filter(s => s.decision === 'approved').length,
    refused: visas.filter(s => s.decision === 'refused').length,
    additional: visas.filter(s => s.decision === 'additional').length,
    closed,
    converted: leads.filter(l => l.status === 'converted' && within(l.updated_at)).length,
    bySource,
    byDest,
    byOfficer,
    newNames: newStu.map(s => s.full_name)
  };

  // Build Tables
  const tables: ReportTable[] = [];

  if (include.includes('leads')) {
    tables.push({
      key: 'leads',
      name: t('Enquiries'),
      columns: [
        t('Code'),
        t('Logged'),
        t('Name'),
        t('Phone'),
        t('Source'),
        t('Interested in'),
        t('Package'),
        t('Status'),
        t('Closed because'),
        t('Calls')
      ],
      types: ['t', 'd', 't', 't', 't', 't', 't', 't', 't', 'n'],
      rows: leadsIn.map(l => [
        l.code,
        dateOf(l.created_at),
        l.name || '',
        l.phone || '',
        t(l.source || ''),
        t(l.interest_country || ''),
        l.interest_package ? t(PACKAGE_LABEL[l.interest_package] || l.interest_package) : '',
        t(l.status),
        l.close_reason ? t(CLOSE_REASONS[l.close_reason] || l.close_reason) : '',
        l.call_attempts || 0
      ])
    });
  }

  if (include.includes('calls')) {
    tables.push({
      key: 'calls',
      name: t('Calls made'),
      columns: [
        t('Date'),
        t('Time'),
        t('Lead'),
        t('Name'),
        t('Phone'),
        t('Call no.'),
        t('Outcome'),
        t('Note'),
        t('Called by')
      ],
      types: ['d', 't', 't', 't', 't', 'n', 't', 't', 't'],
      rows: calls.map(({ call, lead }) => [
        dateOf(call.ts),
        new Date(call.ts).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }),
        lead.code,
        lead.name || '',
        lead.phone || '',
        call.attempt || 1,
        t(LEAD_OUTCOMES[call.outcome] || call.outcome),
        call.note || '',
        call.author_name || call.author || ''
      ])
    });
  }

  if (include.includes('students')) {
    tables.push({
      key: 'students',
      name: t('New students'),
      columns: [
        t('Case'),
        t('Opened'),
        t('Name'),
        t('Phone'),
        t('Source'),
        t('Destination'),
        t('University'),
        t('Package'),
        t('Funding'),
        t('Officer'),
        t('Current step')
      ],
      types: ['t', 'd', 't', 't', 't', 't', 't', 't', 't', 't', 't'],
      rows: newStu.map(s => {
        const stageObj = STAGES_LIST[STAGE_INDEX[s.stage]];
        return [
          s.case_id,
          dateOf(s.created_at),
          s.full_name,
          s.phone || '',
          t(s.source || ''),
          t(destName(s)),
          s.strategy_university || '',
          s.package_type ? t(PACKAGE_LABEL[s.package_type] || s.package_type) : '',
          s.sponsor_type ? t(s.sponsor_type === 'scholarship' ? 'Scholarship' : 'Self funded') : '',
          s.officer || '',
          s.archived ? t('Archived') : t(stageObj?.label || s.stage)
        ];
      })
    });
  }

  if (include.includes('moves')) {
    tables.push({
      key: 'moves',
      name: t('Step moves'),
      columns: [t('Date'), t('Case'), t('Student'), t('From'), t('To'), t('Moved by')],
      types: ['d', 't', 't', 't', 't', 't'],
      rows: moves.map(m => [
        dateOf(m.ts),
        m.student.case_id,
        m.student.full_name,
        t(m.from),
        t(m.to),
        m.author
      ])
    });
  }

  if (include.includes('payments')) {
    const payLabelMap: Record<string, string> = {
      registration: 'Registration fee',
      payment1: 'Payment 1',
      payment2: 'Payment 2'
    };
    tables.push({
      key: 'payments',
      name: t('Payments'),
      columns: [t('Date paid'), t('Case'), t('Student'), t('Payment'), t('Amount (ETB)'), t('Package'), t('Destination')],
      types: ['d', 't', 't', 't', 'm', 't', 't'],
      rows: pays.map(p => [
        dateOf(p.paid_on),
        p.student.case_id,
        p.student.full_name,
        t(payLabelMap[p.kind] || p.kind),
        p.amount,
        p.student.package_type ? t(PACKAGE_LABEL[p.student.package_type] || p.student.package_type) : '',
        t(destName(p.student))
      ])
    });
  }

  if (include.includes('visas')) {
    const decMap: Record<string, string> = {
      approved: 'Approved',
      additional: 'More documents',
      refused: 'Refused'
    };
    tables.push({
      key: 'visas',
      name: t('Visa decisions'),
      columns: [t('Date'), t('Case'), t('Student'), t('Country'), t('University'), t('Decision'), t('Officer')],
      types: ['d', 't', 't', 't', 't', 't', 't'],
      rows: visas.map(s => [
        dateOf(s.decided_at || s.updated_at),
        s.case_id,
        s.full_name,
        t(destName(s)),
        s.strategy_university || '',
        t(decMap[s.decision] || s.decision),
        s.officer || ''
      ])
    });
  }

  return { tables, summary };
}

/** Formatted summary message for Telegram / WhatsApp (spec §6.8) */
export function reportMessage(
  students: Student[],
  leads: Lead[],
  activities: Activity[],
  r: ResolvedRange,
  title: string,
  by: string,
  isPartner: boolean,
  settings: Settings,
  lang: 'en' | 'am' = 'en',
  tFn?: (k: string, opts?: any) => string
): string {
  const t = (key: string, opts?: any) => {
    let text = tFn ? tFn(key, opts) : key;
    if (opts) {
      Object.keys(opts).forEach(k => {
        text = text.replace(new RegExp(`\\{${k}\\}`, 'g'), String(opts[k]));
      });
    }
    return text;
  };
  const { summary: s } = buildReport(students, leads, activities, r.from, r.to, [], lang, t);
  const today = todayIso();

  const overdue = leads.filter(l => l.status === 'open' && (l.next_call_on || today) < today).length;
  const active = students.filter(x => !x.archived && !x.deleted_at);

  const getPayment = (st: Student, kind: 'registration' | 'payment1') =>
    st.payments?.find(p => p.kind === kind);

  const feesDue =
    active.filter(x => x.stage === 'registration' && !getPayment(x, 'registration')?.paid).length +
    active.filter(x => STAGE_INDEX[x.stage] >= STAGE_INDEX.admission && !getPayment(x, 'payment1')?.paid).length;

  const sep = lang === 'am' ? '፣ ' : ', ';
  const src = s.bySource.slice(0, 4).map(([k, v]) => `${t(k)} ${v}`).join(sep);
  const names =
    s.newNames.slice(0, 6).join(sep) +
    (s.newNames.length > 6 ? t(' and {n} more', { n: s.newNames.length - 6 }) : '');

  const lines = [
    `📋 ${settings.business_name || 'Yimaru Consulting'}: ${title}`,
    `🗓 ${r.label}`,
    `✍️ ${t('Prepared by {name}', { name: by || '—' })}`,
    '',
    `📞 ${t('New enquiries: {n}', { n: s.leads })}${src ? ` (${src})` : ''}`,
    `☎️ ${t('Calls made: {n}, answered: {a}', { n: s.calls, a: s.answered })}`,
    `✅ ${t('New students: {n}', { n: s.students })}${names ? `: ${names}` : ''}`,
    `➡️ ${t('Step moves: {n}', { n: s.moves })}`,
    `💳 ${t('Payments received: {n}', { n: s.payments })}${isPartner && s.collected ? `, ${s.collected.toLocaleString()} ${settings.currency || 'ETB'}` : ''}`,
    `🛂 ${t('Visas: {a} approved, {r} refused, {m} asked for more', { a: s.approved, r: s.refused, m: s.additional })}`,
    `❌ ${t('Leads closed: {n}', { n: s.closed })}`,
    '',
    `⚠️ ${t('Right now: {a} calls overdue, {b} payments due', { a: overdue, b: feesDue })}`
  ];

  return lines.join('\n');
}

/** Last N Ethiopian months for the trend chart (Pagume folded into Nehase) */
export function monthlyTrend(
  students: Student[],
  leads: Lead[],
  activities: Activity[],
  months = 6,
  lang: 'en' | 'am' = 'en'
): Array<{ m: string; monthNumber: number; monthName: string; leads: number; students: number; approved: number; collected: number }> {
  const out: Array<{ m: string; monthNumber: number; monthName: string; leads: number; students: number; approved: number; collected: number }> = [];
  let cur = monthStart(todayIso());
  if (toEth(cur)?.m === 13) cur = addMonths(cur, -1);

  while (out.length < months) {
    const e = toEth(cur);
    if (!e) break;
    // When month is 12 (Nehase), fold Pagume (13) in by setting end to end of Pagume
    const end = e.m === 12 ? monthEnd(addMonths(cur, 1)) : monthEnd(cur);
    const { summary: s } = buildReport(students, leads, activities, cur, end, [], lang);

    out.unshift({
      m: cur,
      monthNumber: e.m,
      monthName: ethMonthName(e.m, lang),
      leads: s.leads,
      students: s.students,
      approved: s.approved,
      collected: s.collected
    });

    cur = addMonths(cur, -1);
    if (toEth(cur)?.m === 13) cur = addMonths(cur, -1);
  }

  return out;
}

/** CSV export with UTF-8 BOM */
export function toCSV(tables: ReportTable[]): string {
  const esc = (s: any) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const parts: string[] = [];

  tables.forEach(t => {
    parts.push(esc(t.name));
    parts.push(t.columns.map(esc).join(','));
    t.rows.forEach(r => {
      parts.push(r.map((v, i) => esc(cellText(v, t.types[i]))).join(','));
    });
    parts.push(''); // blank line
  });

  return '\uFEFF' + parts.join('\r\n');
}

/** Printable HTML standalone document (spec §6.8) */
export function reportHTML({
  students,
  leads,
  activities,
  r,
  include,
  by,
  isPartner,
  settings,
  lang = 'en'
}: {
  students: Student[];
  leads: Lead[];
  activities: Activity[];
  r: ResolvedRange;
  include: ReportDatasetKey[];
  by: string;
  isPartner: boolean;
  settings: Settings;
  lang?: 'en' | 'am';
}): string {
  const { tables, summary: s } = buildReport(students, leads, activities, r.from, r.to, include, lang);
  const esc = (x: any) => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] || c));

  const kp: Array<[string, any, string]> = [
    ['New enquiries', s.leads, '#CDF5EA'],
    ['Calls made', s.calls, '#DCE8FC'],
    ['New students', s.students, '#E8DDF8'],
    ['Step moves', s.moves, '#F8DAF0'],
    ['Payments received', s.payments, '#FFF0A8'],
    ['Visas approved', s.approved, '#DFF3CD']
  ];
  if (isPartner) {
    kp.push(['Collected', `${s.collected.toLocaleString()} ${settings.currency || 'ETB'}`, '#FDE4D2']);
  }

  const lists: Array<[string, Array<[string, number]>]> = [
    ['Enquiries by source', s.bySource],
    ['New students by destination', s.byDest]
  ];

  return `<!doctype html>
<html lang="${lang}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>${esc(`Yimaru report ${r.plain}`)}</title>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Hanken+Grotesk:wght@400;600;700;800&family=Noto+Sans+Ethiopic:wght@400;600;700&display=swap">
  <style>
    body { margin: 0; background: #F6F2F6; color: #211320; font: 14px/1.45 'Hanken Grotesk', 'Noto Sans Ethiopic', system-ui, sans-serif; }
    .pg { max-width: 1100px; margin: 24px auto; background: #fff; border-radius: 20px; padding: 32px; box-shadow: 0 4px 14px rgba(46,12,43,.06); }
    header { display: flex; justify-content: space-between; align-items: center; gap: 20px; padding-bottom: 16px; border-bottom: 4px solid #9A288D; }
    header img { height: 52px; }
    h1 { margin: 0; font-size: 26px; color: #3E0F3A; }
    .m { color: #7D6F7C; font-size: 13px; }
    .k { display: grid; grid-template-columns: repeat(auto-fit, minmax(130px, 1fr)); gap: 10px; margin: 22px 0; }
    .k div { border-radius: 14px; padding: 12px 14px; }
    .k span { display: block; font-size: 12px; font-weight: 600; color: #4B3D4A; }
    .k b { font-size: 24px; }
    .l { display: grid; grid-template-columns: 1fr 1fr; gap: 24px; margin-bottom: 12px; }
    .l h2, section h2 { font-size: 15px; margin: 18px 0 8px; color: #3E0F3A; }
    .l p { display: flex; justify-content: space-between; margin: 0; padding: 6px 0; border-bottom: 1px solid #F2ECF2; }
    table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
    th { background: #3E0F3A; color: #fff; text-align: left; padding: 7px 8px; white-space: nowrap; }
    td { padding: 6px 8px; border-bottom: 1px solid #F2ECF2; }
    tr:nth-child(even) td { background: #FBF6FA; }
    .r { text-align: right; }
    button { position: fixed; right: 20px; top: 20px; border: 0; border-radius: 999px; background: #9A288D; color: #fff; font: inherit; font-weight: 700; padding: 10px 20px; cursor: pointer; }
    @media print {
      body { background: #fff; }
      .pg { margin: 0; box-shadow: none; padding: 0; max-width: 100%; }
      button { display: none; }
      section { break-inside: auto; }
    }
  </style>
</head>
<body>
  <button onclick="window.print()">Print or save as PDF</button>
  <div class="pg">
    <header>
      <div>
        <h1>Activity report</h1>
        <div>${esc(settings.business_name || 'Yimaru Consulting')} · ${esc(r.label)}</div>
        <div class="m">Prepared by ${esc(by || '—')} on ${esc(dmy(todayIso()))}</div>
      </div>
      <img src="/yimaru-logo-full.png" alt="Yimaru Consulting" />
    </header>

    <div class="k">
      ${kp.map(([l, v, c]) => `<div style="background:${c}"><span>${esc(l)}</span><b>${esc(v)}</b></div>`).join('')}
    </div>

    <div class="l">
      ${lists
        .map(
          ([title, rows]) => `
        <div>
          <h2>${esc(title)}</h2>
          ${
            rows.length
              ? rows.map(([k, v]) => `<p><span>${esc(k)}</span><b>${v}</b></p>`).join('')
              : '<p class="m">None in this period.</p>'
          }
        </div>
      `
        )
        .join('')}
    </div>

    ${tables
      .map(
        t => `
      <section>
        <h2>${esc(t.name)} <span class="m">(${t.rows.length})</span></h2>
        ${
          t.rows.length
            ? `
          <table>
            <thead>
              <tr>${t.columns.map((c, j) => `<th class="${t.types[j] === 'm' || t.types[j] === 'n' ? 'r' : ''}">${esc(c)}</th>`).join('')}</tr>
            </thead>
            <tbody>
              ${t.rows.map(row => `<tr>${row.map((v, j) => `<td class="${t.types[j] === 'm' || t.types[j] === 'n' ? 'r' : ''}">${esc(cellText(v, t.types[j]))}</td>`).join('')}</tr>`).join('')}
            </tbody>
          </table>
        `
            : '<p class="m">None in this period.</p>'
        }
      </section>
    `
      )
      .join('')}
  </div>
</body>
</html>`;
}

/** Full ExcelJS branded workbook export (spec §6.8) */
export async function buildWorkbook({
  students,
  leads,
  activities,
  r,
  include,
  by,
  isPartner,
  settings,
  lang = 'en'
}: {
  students: Student[];
  leads: Lead[];
  activities: Activity[];
  r: ResolvedRange;
  include: ReportDatasetKey[];
  by: string;
  isPartner: boolean;
  settings: Settings;
  lang?: 'en' | 'am';
}): Promise<Blob> {
  const { tables, summary: s } = buildReport(students, leads, activities, r.from, r.to, include, lang);
  const font = lang === 'am' ? 'Nyala' : 'Calibri';
  const wb = new ExcelJS.Workbook();
  wb.creator = settings.business_name || 'Yimaru Consulting';
  wb.created = new Date();

  const fill = (argb: string): ExcelJS.Fill => ({
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb }
  });

  const XB = {
    plum: 'FF2E0C2B',
    plumD: 'FF3E0F3A',
    violet: 'FF9A288D',
    yellow: 'FFFFD23F',
    ink: 'FF211320',
    muted: 'FF7D6F7C',
    line: 'FFE8DFE8',
    white: 'FFFFFFFF',
    vvLight: 'FFFBF6FA'
  };

  const XTAB: Record<string, string> = {
    summary: 'FF9A288D',
    leads: 'FF22D3A6',
    calls: 'FF4C6FE0',
    students: 'FF9A288D',
    moves: 'FFF5BAC9',
    payments: 'FFFFD23F',
    visas: 'FF14A57F'
  };

  const XSOFT: Record<string, [string, string]> = {
    leads: ['FFCDF5EA', 'FF004D40'],
    calls: ['FFDCE8FC', 'FF1B3E84'],
    students: ['FFE8DDF8', 'FF3E1F58'],
    moves: ['FFF8DAF0', 'FF6E1F60'],
    payments: ['FFFFF0A8', 'FF5C4300'],
    visas: ['FFDFF3CD', 'FF1A5A1E'],
    money: ['FFFDE4D2', 'FF6E2E0A']
  };

  // 1. SUMMARY SHEET
  const ws = wb.addWorksheet(lang === 'am' ? 'ማጠቃለያ' : 'Summary', {
    properties: { tabColor: { argb: XTAB.summary } },
    views: [{ showGridLines: false }]
  });

  ws.columns = [
    { width: 3 },
    { width: 24 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 3 }
  ];

  ws.getRow(1).height = 10;
  for (let rr = 2; rr <= 5; rr++) ws.getRow(rr).height = 21;

  ['D2:G2', 'D3:G3', 'D4:G4'].forEach(m => ws.mergeCells(m));

  ws.getCell('D2').value = lang === 'am' ? 'የሥራ እንቅስቃሴ ሪፖርት' : 'Activity report';
  ws.getCell('D2').font = { name: font, size: 20, bold: true, color: { argb: XB.plum } };

  ws.getCell('D3').value = r.label;
  ws.getCell('D3').font = { name: font, size: 12, color: { argb: XB.ink } };

  ws.getCell('D4').value =
    lang === 'am'
      ? `የተዘጋጀው በ${by || '—'} በ${dmy(todayIso())}`
      : `Prepared by ${by || '—'} on ${dmy(todayIso())}`;
  ws.getCell('D4').font = { name: font, size: 10, color: { argb: XB.muted } };

  ['D2', 'D3', 'D4'].forEach(c => (ws.getCell(c).alignment = { horizontal: 'right', vertical: 'middle' }));

  ws.getRow(6).height = 6;
  const bar = ['FF9A288D', 'FF7A2194', 'FF6A1B9A', 'FF4C6FE0', 'FF34AACB', 'FF1DE9B6'];
  for (let c = 2; c <= 7; c++) {
    ws.getRow(6).getCell(c).fill = fill(bar[c - 2]);
  }

  let rowIdx = 8;
  const band = (title: string) => {
    ws.mergeCells(rowIdx, 2, rowIdx, 7);
    const cell = ws.getCell(rowIdx, 2);
    cell.value = title;
    cell.font = { name: font, size: 11, bold: true, color: { argb: XB.white } };
    cell.fill = fill(XB.plum);
    cell.alignment = { vertical: 'middle', indent: 1 };
    ws.getRow(rowIdx).height = 24;
    rowIdx += 1;
  };

  band(lang === 'am' ? 'ዋና ዋና ቁጥሮች' : 'Key figures');

  const kpis: Array<[string, any, [string, string], boolean?]> = [
    [lang === 'am' ? 'አዳዲስ ጥያቄዎች' : 'New enquiries', s.leads, XSOFT.leads],
    [lang === 'am' ? 'የተደረጉ ጥሪዎች' : 'Calls made', s.calls, XSOFT.calls],
    [lang === 'am' ? 'አዳዲስ ተማሪዎች' : 'New students', s.students, XSOFT.students],
    [lang === 'am' ? 'የደረጃ ለውጦች' : 'Step moves', s.moves, XSOFT.moves],
    [lang === 'am' ? 'የተቀበሉት ክፍያዎች' : 'Payments received', s.payments, XSOFT.payments],
    [lang === 'am' ? 'የተፈቀዱ ቪዛዎች' : 'Visas approved', s.approved, XSOFT.visas]
  ];
  if (isPartner) {
    kpis.push([lang === 'am' ? 'የተሰበሰበ (ብር)' : 'Collected (ETB)', s.collected, XSOFT.money, true]);
  }

  for (let i = 0; i < kpis.length; i += 3) {
    const lr = ws.getRow(rowIdx);
    const vr = ws.getRow(rowIdx + 1);
    lr.height = 20;
    vr.height = 32;

    kpis.slice(i, i + 3).forEach(([label, v, [bg, fg], isMoney], j) => {
      const col = 2 + j * 2;
      ws.mergeCells(rowIdx, col, rowIdx, col + 1);
      ws.mergeCells(rowIdx + 1, col, rowIdx + 1, col + 1);

      const lCell = ws.getCell(rowIdx, col);
      const valCell = ws.getCell(rowIdx + 1, col);

      lCell.value = label;
      lCell.font = { name: font, size: 10, bold: true, color: { argb: fg } };
      lCell.fill = fill(bg);
      lCell.alignment = { indent: 1, vertical: 'bottom' };

      valCell.value = v;
      valCell.numFmt = isMoney ? '#,##0' : '0';
      valCell.font = { name: font, size: 20, bold: true, color: { argb: XB.ink } };
      valCell.fill = fill(bg);
      valCell.alignment = { indent: 1, horizontal: 'left', vertical: 'middle' };
    });
    rowIdx += 3;
  }

  // Lists on Summary
  const list = (title: string, rows: Array<[string, number]>, cols: string[]) => {
    if (!rows.length) return;
    band(title);
    const h = ws.getRow(rowIdx);
    cols.forEach((c, j) => {
      const cell = h.getCell(2 + j);
      cell.value = c;
      cell.font = { name: font, size: 10, bold: true, color: { argb: XB.muted } };
    });
    rowIdx++;
    rows.forEach(vals => {
      const rr = ws.getRow(rowIdx);
      vals.forEach((v, j) => {
        const cell = rr.getCell(2 + j);
        cell.value = v;
        cell.font = { name: font, size: 11, color: { argb: XB.ink } };
        if (typeof v === 'number' && v > 999) cell.numFmt = '#,##0';
      });
      rowIdx++;
    });
    rowIdx++;
  };

  list(
    lang === 'am' ? 'ጥያቄዎች በመረጃ ምንጭ' : 'Enquiries by source',
    s.bySource,
    [lang === 'am' ? 'ምንጭ' : 'Source', lang === 'am' ? 'ብዛት' : 'Count']
  );

  list(
    lang === 'am' ? 'አዳዲስ ተማሪዎች በሀገር' : 'New students by destination',
    s.byDest,
    [lang === 'am' ? 'ሀገር' : 'Destination', lang === 'am' ? 'ብዛት' : 'Count']
  );

  // Disclaimer note
  const noteRow = ws.getRow(rowIdx + 1);
  ws.mergeCells(rowIdx + 1, 2, rowIdx + 1, 7);
  noteRow.getCell(2).value =
    lang === 'am' ? 'ሁሉም ቀናት በኢትዮጵያ ዘመን አቆጣጠር ናቸው።' : 'All dates are in the Ethiopian calendar.';
  noteRow.getCell(2).font = { name: font, size: 10, italic: true, color: { argb: XB.muted } };

  // 2. DATASET WORKSHEETS
  tables.forEach(t => {
    const sh = wb.addWorksheet(t.name, {
      properties: { tabColor: { argb: XTAB[t.key] || 'FF9A288D' } },
      views: [{ state: 'frozen', ySplit: 3 }]
    });

    sh.mergeCells('A1:E1');
    sh.getCell('A1').value = `${t.name} · ${r.label}`;
    sh.getCell('A1').font = { name: font, size: 14, bold: true, color: { argb: XB.plum } };
    sh.getRow(1).height = 24;

    const hr = sh.getRow(3);
    hr.height = 24;
    t.columns.forEach((c, j) => {
      const cell = hr.getCell(j + 1);
      cell.value = c;
      cell.font = { name: font, size: 10, bold: true, color: { argb: XB.white } };
      cell.fill = fill(XB.plumD);
      cell.alignment = {
        horizontal: t.types[j] === 'm' || t.types[j] === 'n' ? 'right' : 'left',
        vertical: 'middle'
      };
    });

    if (t.rows.length) {
      sh.autoFilter = {
        from: { row: 3, column: 1 },
        to: { row: 3, column: t.columns.length }
      };

      t.rows.forEach((row, i) => {
        const rr = sh.getRow(4 + i);
        rr.height = 19;
        row.forEach((v, j) => {
          const cell = rr.getCell(j + 1);
          const type = t.types[j];
          if (type === 'm' || type === 'n') {
            cell.value = Number(v) || 0;
            cell.numFmt = type === 'm' ? '#,##0' : '0';
          } else if (type === 'd') {
            cell.value = dmy(String(v));
          } else {
            cell.value = v === undefined || v === null ? '' : String(v);
          }
          cell.font = { name: font, size: 10, color: { argb: XB.ink } };
          cell.alignment = {
            horizontal: type === 'm' || type === 'n' ? 'right' : 'left',
            vertical: 'middle'
          };
          if (i % 2 === 1) cell.fill = fill(XB.vvLight);
        });
      });

      // SUM total for money columns (partners only)
      const mi = t.types.indexOf('m');
      if (mi >= 0 && isPartner) {
        const tr = sh.getRow(4 + t.rows.length);
        tr.height = 22;
        tr.getCell(1).value = lang === 'am' ? 'ድምር' : 'Total';
        tr.getCell(1).font = { name: font, bold: true };
        tr.getCell(1).fill = fill(XB.vvLight);

        const colLetter = String.fromCharCode(65 + mi);
        const cell = tr.getCell(mi + 1);
        cell.value = {
          formula: `SUM(${colLetter}4:${colLetter}${3 + t.rows.length})`,
          result: t.rows.reduce((sum, x) => sum + (Number(x[mi]) || 0), 0)
        };
        cell.numFmt = '#,##0';
        cell.font = { name: font, bold: true };
        cell.fill = fill(XB.vvLight);
      }
    } else {
      sh.getCell(4, 1).value = lang === 'am' ? 'በዚህ ጊዜ ውስጥ ምንም የለም።' : 'None in this period.';
      sh.getCell(4, 1).font = { name: font, italic: true, color: { argb: XB.muted } };
    }

    // Auto-fit column widths
    sh.columns.forEach((col, j) => {
      const w = Math.max(
        String(t.columns[j] || '').length,
        ...t.rows.map(x => cellText(x[j], t.types[j]).length)
      );
      col.width = Math.min(Math.max(w + 3, 10), 38);
    });
  });

  const buffer = await wb.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  });
}
