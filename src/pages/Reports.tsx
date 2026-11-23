import { useState, useMemo, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Icon } from '../components/Icon';
import { DateInput } from '../components/DateInput';
import { Segmented } from '../components/Segmented';
import RankList from '../components/RankList';
import {
  todayIso,
  dmy,
  monthStart
} from '../lib/ethiopian-calendar';
import {
  DATASETS,
  DATASET_INFO,
  resolveReportRange,
  buildReport,
  reportMessage,
  monthlyTrend,
  toCSV,
  reportHTML,
  buildWorkbook,
  cellText,
  type ReportDatasetKey
} from '../lib/reports';

const TONES: Record<string, { bg: string; fg: string }> = {
  leads: { bg: '#CDF5EA', fg: '#004D40' },
  calls: { bg: '#DCE8FC', fg: '#1B3E84' },
  students: { bg: '#E8DDF8', fg: '#3E1F58' },
  moves: { bg: '#F8DAF0', fg: '#6E1F60' },
  payments: { bg: '#FFF0A8', fg: '#5C4300' },
  visas: { bg: '#DFF3CD', fg: '#1A5A1E' },
  money: { bg: '#FDE4D2', fg: '#6E2E0A' },
  plum: { bg: '#3E0F3A', fg: '#FFFFFF' }
};

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function StepHeader({ n, title, hint }: { n: number; title: string; hint?: string }) {
  return (
    <div className="rpt-step">
      <span>{n}</span>
      <div>
        <b>{title}</b>
        {hint ? <p>{hint}</p> : null}
      </div>
    </div>
  );
}

/* ============================================================
   TREND CHART COMPONENT
   ============================================================ */
function TrendChart({
  data,
  isPartner
}: {
  data: Array<{ m: string; monthNumber: number; monthName: string; leads: number; students: number; approved: number; collected: number }>;
  isPartner: boolean;
}) {
  const { t } = useTranslation();
  const [hover, setHover] = useState(-1);
  const [table, setTable] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const [cw, setCw] = useState(900);

  const series: Array<['leads' | 'students' | 'approved', string, string]> = [
    ['leads', t('Enquiries'), '#4C6FE0'],
    ['students', t('New students'), '#9A288D'],
    ['approved', t('Visas approved'), '#14A57F']
  ];

  useEffect(() => {
    const el = wrap.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(([e]) => {
      const w = Math.round(e.contentRect.width);
      if (w > 0) setCw(w);
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, [table]);

  const W = Math.max(300, cw);
  const H = cw < 560 ? 220 : 250;
  const padL = 36;
  const padB = 26;
  const padT = 16;

  const maxVal = Math.max(4, ...data.flatMap(d => series.map(([k]) => d[k])));
  const nice = Math.ceil(maxVal / 4) * 4;
  const gw = data.length > 0 ? (W - padL) / data.length : 1;
  const bw = Math.min(16, (gw - 18) / 3);
  const getY = (v: number) => padT + (H - padT - padB) * (1 - v / nice);

  return (
    <section className="panel">
      <div className="panel-h">
        <h2>{t('Last 6 months')}</h2>
        <div className="rpt-legend">
          {series.map(([k, label, color]) => (
            <span key={k}>
              <i style={{ background: color }} />
              {label}
            </span>
          ))}
        </div>
        <div className="panel-x">
          <Segmented
            items={[
              ['chart', t('Chart')],
              ['table', t('Table')]
            ]}
            value={table ? 'table' : 'chart'}
            onChange={v => setTable(v === 'table')}
          />
        </div>
      </div>

      {table ? (
        <div className="rpt-tw">
          <table className="rpt-t">
            <thead>
              <tr>
                <th>{t('Month')}</th>
                {series.map(([k, label]) => (
                  <th key={k} className="r">
                    {label}
                  </th>
                ))}
                {isPartner && <th className="r">{t('Collected')}</th>}
              </tr>
            </thead>
            <tbody>
              {data.map(d => (
                <tr key={d.m}>
                  <td>{d.monthName}</td>
                  {series.map(([k]) => (
                    <td key={k} className="r">
                      {d[k]}
                    </td>
                  ))}
                  {isPartner && <td className="r">{d.collected.toLocaleString()} ETB</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="rpt-chart" ref={wrap} onMouseLeave={() => setHover(-1)}>
          <svg
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={t('Enquiries, new students and visas approved, month by month')}
          >
            {[0, 0.25, 0.5, 0.75, 1].map(f => (
              <g key={f}>
                <line
                  x1={padL}
                  x2={W}
                  y1={getY(nice * f)}
                  y2={getY(nice * f)}
                  stroke="var(--line)"
                  strokeWidth="1"
                />
                <text x={padL - 8} y={getY(nice * f) + 4} textAnchor="end" className="rpt-ax">
                  {Math.round(nice * f)}
                </text>
              </g>
            ))}
            {data.map((d, i) => {
              const x0 = padL + i * gw + (gw - bw * 3 - 4) / 2;
              return (
                <g
                  key={d.m}
                  onMouseEnter={() => setHover(i)}
                  onFocus={() => setHover(i)}
                  tabIndex={0}
                  style={{ cursor: 'pointer' }}
                >
                  <rect
                    x={padL + i * gw}
                    y={padT}
                    width={gw}
                    height={H - padT - padB}
                    fill={hover === i ? 'rgba(154,40,141,.06)' : 'transparent'}
                  />
                  {series.map(([k, , color], j) => {
                    const v = d[k];
                    const top = getY(v);
                    const h = Math.max(0, H - padB - top);
                    return v > 0 ? (
                      <path
                        key={k}
                        d={`M${x0 + j * (bw + 2)},${H - padB} v${-Math.max(h - 4, 0)} q0,-4 4,-4 h${bw - 8} q4,0 4,4 v${Math.max(h - 4, 0)} z`}
                        fill={color}
                      />
                    ) : null;
                  })}
                  <text
                    x={padL + i * gw + gw / 2}
                    y={H - 8}
                    textAnchor="middle"
                    className="rpt-ax"
                  >
                    {d.monthName}
                  </text>
                </g>
              );
            })}
          </svg>
          {hover >= 0 && hover < data.length && (
            <div
              className="rpt-tip"
              style={{
                left: `${((padL + hover * gw + gw / 2) / W) * 100}%`
              }}
            >
              <b>{data[hover].monthName}</b>
              {series.map(([k, label, color]) => (
                <span key={k}>
                  <i style={{ background: color }} />
                  {label}
                  <em>{data[hover][k]}</em>
                </span>
              ))}
              {isPartner && (
                <span>
                  <i style={{ background: 'transparent' }} />
                  {t('Collected')}
                  <em>{data[hover].collected.toLocaleString()} ETB</em>
                </span>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
}

/* ============================================================
   ON-SCREEN REPORT VIEW COMPONENT
   ============================================================ */
function ReportView({
  spec,
  back,
  onExcel,
  addToast
}: {
  spec: { range: string; from: string; to: string; what: ReportDatasetKey[] };
  back: () => void;
  onExcel: (rangeKey: string, what: ReportDatasetKey[]) => void;
  addToast: (msg: string, type?: 'success' | 'warn' | 'error' | 'info') => void;
}) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as 'en' | 'am') || 'en';
  const tr = (k: string, opts?: any) => String(t(k as any, opts));
  const { currentUser, isPartner } = useAuth();
  const { students, leads, activities, settings } = useData();

  const r = resolveReportRange(spec.range, spec.from, spec.to, lang);
  const { tables, summary: s } = buildReport(students, leads, activities, r.from, r.to, spec.what, lang, tr);

  const kp: Array<[string, any, { bg: string; fg: string }]> = [
    [t('New enquiries'), s.leads, TONES.leads],
    [t('Calls made'), s.calls, TONES.calls],
    [t('New students'), s.students, TONES.students],
    [t('Step moves'), s.moves, TONES.moves],
    [t('Payments received'), s.payments, TONES.payments],
    [t('Visas approved'), s.approved, TONES.visas]
  ];
  if (isPartner) {
    kp.push([t('Collected'), `${s.collected.toLocaleString()} ${settings.currency || 'ETB'}`, TONES.money]);
  }

  const copyTable = () => {
    const text = toCSV(tables).replace(/,/g, '\t');
    try {
      navigator.clipboard.writeText(text).then(
        () => addToast(t('Copied. Paste it into Excel or Google Sheets.'), 'success'),
        () => addToast(t('Couldn’t copy here.'), 'warn')
      );
    } catch {
      addToast(t('Couldn’t copy here.'), 'warn');
    }
  };

  return (
    <div className="pg">
      <div className="rpt-bar">
        <button className="btn" onClick={back}>
          <Icon name="back" />
          {t('Back to reports')}
        </button>
        <div className="rpt-bar-a">
          <button className="btn primary" onClick={() => onExcel(spec.range, spec.what)}>
            <Icon name="dl" />
            {t('Download Excel')}
          </button>
          <button className="btn" onClick={copyTable}>
            <Icon name="copy" />
            {t('Copy table')}
          </button>
        </div>
      </div>

      <article className="panel rpt-doc">
        <header className="rpt-doc-h">
          <div>
            <h1>{t('Activity report')}</h1>
            <p>
              {settings.business_name || 'Yimaru Consulting'} · {r.label}
            </p>
            <p className="muted small">
              {t('Prepared by {name} on {date}', {
                name: currentUser?.full_name || '—',
                date: dmy(todayIso())
              })}
            </p>
          </div>
          <img src="/yimaru-logo-full.png" alt="Yimaru Consulting" />
        </header>

        <div className="rpt-kp">
          {kp.map(([label, val, tone]) => (
            <div key={label} style={{ background: tone.bg, color: tone.fg }}>
              <span>{label}</span>
              <b>{val}</b>
            </div>
          ))}
        </div>

        <div className="rpt-lists">
          <div>
            <h2>{t('Enquiries by source')}</h2>
            <RankList
              rows={s.bySource.map(([k, v]) => ({ key: k, label: t(k), n: v }))}
              color="#4C6FE0"
              empty={t('None in this period.')}
            />
          </div>
          <div>
            <h2>{t('New students by destination')}</h2>
            <RankList
              rows={s.byDest.map(([k, v]) => ({ key: k, label: t(k), n: v }))}
              color="#9A288D"
              empty={t('None in this period.')}
            />
          </div>
          {s.byOfficer.length > 0 && (
            <div className="rpt-wide">
              <h2>{t('Work by team member')}</h2>
              <div className="rpt-tw">
                <table className="rpt-t">
                  <thead>
                    <tr>
                      <th>{t('Team member')}</th>
                      <th className="r">{t('Calls')}</th>
                      <th className="r">{t('Step moves')}</th>
                      <th className="r">{t('New students')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.byOfficer.map(([k, v]) => (
                      <tr key={k}>
                        <td>{k}</td>
                        <td className="r">{v.calls}</td>
                        <td className="r">{v.moves}</td>
                        <td className="r">{v.students}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {tables.map(table => (
          <section key={table.key} className="rpt-sec">
            <h2>
              <i style={{ background: TONES[table.key]?.fg || '#9A288D' }} />
              {table.name}
              <span className="cnt">{table.rows.length}</span>
            </h2>
            {table.rows.length === 0 ? (
              <p className="muted">{t('None in this period.')}</p>
            ) : (
              <div className="rpt-tw">
                <table className="rpt-t">
                  <thead>
                    <tr>
                      {table.columns.map((col, j) => (
                        <th
                          key={j}
                          className={table.types[j] === 'm' || table.types[j] === 'n' ? 'r' : ''}
                        >
                          {col}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {table.rows.map((row, i) => (
                      <tr key={i}>
                        {row.map((val, j) => (
                          <td
                            key={j}
                            className={table.types[j] === 'm' || table.types[j] === 'n' ? 'r' : ''}
                          >
                            {cellText(val, table.types[j])}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                  {table.types.includes('m') && isPartner && (
                    <tfoot>
                      <tr>
                        {table.columns.map((_, j) => (
                          <td
                            key={j}
                            className={table.types[j] === 'm' ? 'r' : ''}
                          >
                            {j === 0
                              ? t('Total')
                              : table.types[j] === 'm'
                              ? `${Number(
                                  table.rows.reduce((sum, x) => sum + (Number(x[j]) || 0), 0)
                                ).toLocaleString()} ETB`
                              : ''}
                          </td>
                        ))}
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}
          </section>
        ))}
      </article>
    </div>
  );
}

/* ============================================================
   MAIN REPORTS PAGE
   ============================================================ */
export default function Reports() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as 'en' | 'am') || 'en';
  const tr = (k: string, opts?: any) => String(t(k as any, opts));
  const { currentUser, isPartner } = useAuth();
  const { students, leads, activities, settings, addToast } = useData();

  const periods: Array<[string, string, string]> = [
    ['today', t('Today'), t('Daily report')],
    ['week', t('This week'), t('Weekly report')],
    ['lastWeek', t('Last week'), t('Weekly report')],
    ['month', t('This month'), t('Monthly report')],
    ['lastMonth', t('Last month'), t('Monthly report')]
  ];

  const [periodKey, setPeriodKey] = useState<string>('week');
  const [copiedPeriod, setCopiedPeriod] = useState<string>('');
  const [what, setWhat] = useState<ReportDatasetKey[]>(['leads', 'calls', 'students', 'payments']);
  const [customRangeKey, setCustomRangeKey] = useState<string>('month');
  const [from, setFrom] = useState(monthStart(todayIso()));
  const [to, setTo] = useState(todayIso());
  const [fmt, setFmt] = useState<'excel' | 'csv' | 'html'>('excel');
  const [busy, setBusy] = useState<string>('');
  const [viewSpec, setViewSpec] = useState<{
    range: string;
    from: string;
    to: string;
    what: ReportDatasetKey[];
  } | null>(null);

  const byName = currentUser?.full_name || '';

  // Partner summary data
  const wr = resolveReportRange(periodKey, undefined, undefined, lang);
  const periodTitle = periods.find(x => x[0] === periodKey)?.[2] || t('Weekly report');
  const msg = useMemo(
    () => reportMessage(students, leads, activities, wr, periodTitle, byName, isPartner, settings, lang, tr),
    [students, leads, activities, wr, periodTitle, byName, isPartner, settings, lang, tr]
  );
  const partnerSummary = useMemo(
    () => buildReport(students, leads, activities, wr.from, wr.to, [], lang, tr).summary,
    [students, leads, activities, wr, lang, tr]
  );

  // Custom range summary & row counts
  const cr = resolveReportRange(customRangeKey, from, to, lang);
  const allDatasetsReport = useMemo(
    () => buildReport(students, leads, activities, cr.from, cr.to, DATASETS, lang, tr),
    [students, leads, activities, cr, lang, tr]
  );
  const counts = useMemo(
    () => Object.fromEntries(allDatasetsReport.tables.map(table => [table.key, table.rows.length])),
    [allDatasetsReport]
  );

  // 6 months trend data
  const trend = useMemo(
    () => monthlyTrend(students, leads, activities, 6, lang),
    [students, leads, activities, lang]
  );

  const scrollToTop = () => {
    try {
      window.scrollTo(0, 0);
    } catch {}
  };

  const openView = (rangeKey: string, selectedWhat: ReportDatasetKey[]) => {
    setViewSpec({ range: rangeKey, from, to, what: selectedWhat });
    scrollToTop();
  };

  const handleExcelExport = async (rangeKey: string, selectedWhat: ReportDatasetKey[]) => {
    if (busy) return;
    setBusy('excel');
    try {
      const rr = resolveReportRange(rangeKey, from, to, lang);
      const blob = await buildWorkbook({
        students,
        leads,
        activities,
        r: rr,
        include: selectedWhat,
        by: byName,
        isPartner,
        settings,
        lang
      });
      downloadBlob(blob, `Yimaru report ${rr.plain}.xlsx`);
      addToast(t('Excel file downloaded.'), 'success');
    } catch (err) {
      addToast(t('Couldn’t create the Excel file. Check the internet connection and try again.'), 'error');
    }
    setBusy('');
  };

  const handleDownload = async () => {
    if (fmt === 'excel') {
      return handleExcelExport(customRangeKey, what);
    }
    const reportData = buildReport(students, leads, activities, cr.from, cr.to, what, lang, tr);
    if (fmt === 'csv') {
      const csvStr = toCSV(reportData.tables);
      downloadBlob(new Blob([csvStr], { type: 'text/csv;charset=utf-8' }), `Yimaru report ${cr.plain}.csv`);
      addToast(t('CSV file downloaded.'), 'success');
      return;
    }
    // HTML
    const htmlStr = reportHTML({
      students,
      leads,
      activities,
      r: cr,
      include: what,
      by: byName,
      isPartner,
      settings,
      lang
    });
    downloadBlob(new Blob([htmlStr], { type: 'text/html;charset=utf-8' }), `Yimaru report ${cr.plain}.html`);
    addToast(t('Page downloaded. Open it and choose Print to save a PDF.'), 'success');
  };

  const handleCopyMessage = () => {
    try {
      navigator.clipboard.writeText(msg).then(
        () => {
          setCopiedPeriod(wr.label);
          addToast(t('Report copied. Paste it in the partners’ Telegram group.'), 'success');
        },
        () => addToast(t('Couldn’t copy here. Select the text and copy it.'), 'warn')
      );
    } catch {
      addToast(t('Couldn’t copy here. Select the text and copy it.'), 'warn');
    }
  };

  if (viewSpec) {
    return (
      <ReportView
        spec={viewSpec}
        back={() => {
          setViewSpec(null);
          scrollToTop();
        }}
        onExcel={handleExcelExport}
        addToast={addToast}
      />
    );
  }

  const quickReports: Array<[string, string, { bg: string; fg: string }]> = [
    ['week', t('Weekly'), TONES.calls],
    ['month', t('Monthly'), TONES.leads],
    ['year', t('Yearly'), TONES.payments]
  ];

  const heroTiles: Array<[string, any, string, { bg: string; fg: string }]> = [
    [t('New enquiries'), partnerSummary.leads, 'chat', TONES.leads],
    [t('Calls made'), partnerSummary.calls, 'phone', TONES.calls],
    [t('New students'), partnerSummary.students, 'users', TONES.students],
    [t('Step moves'), partnerSummary.moves, 'right', TONES.moves],
    isPartner
      ? [t('Collected'), `${partnerSummary.collected.toLocaleString()} ETB`, 'money', TONES.payments]
      : [t('Payments received'), partnerSummary.payments, 'money', TONES.payments],
    [t('Visas approved'), partnerSummary.approved, 'plane', TONES.visas]
  ];

  const fileFormats: Array<['excel' | 'csv' | 'html', string, string]> = [
    ['excel', t('Excel'), t('A summary sheet, then one sheet per part')],
    ['csv', 'CSV', t('Plain table that opens anywhere')],
    ['html', t('Printable page'), t('Open in a browser, print or save as PDF')]
  ];

  return (
    <div className="pg">
      <header className="page-head">
        <div>
          <h1 className="page-head-t">{t('Reports')}</h1>
          <p className="page-head-s">
            {t('Send the team update to the partners, or download any report you need.')}
          </p>
        </div>
      </header>

      {/* Hero: Report to partners */}
      <section className="rpt-hero">
        <div className="rpt-hero-h">
          <span className="rpt-hero-ic">
            <Icon name="send" />
          </span>
          <div className="rpt-hero-t">
            <h2>{t('Report to partners')}</h2>
            <p>{t('Pick the day, week or month. The summary fills itself in, ready to send.')}</p>
          </div>
          <div className="rpt-per" role="group" aria-label={t('Report period')}>
            {periods.map(([k, label]) => (
              <button
                key={k}
                aria-pressed={periodKey === k}
                className={periodKey === k ? 'on' : ''}
                onClick={() => setPeriodKey(k)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="rpt-hero-b">
          <div className="rpt-hero-l">
            <span className="rpt-eyebrow">
              {periodTitle} · {wr.label}
            </span>
            <div className="rpt-tiles">
              {heroTiles.map(([label, val, iconName, tone]) => (
                <div key={label} style={{ background: tone.bg, color: tone.fg }}>
                  <span>
                    <Icon name={iconName} />
                    {label}
                  </span>
                  <b className={typeof val === 'string' ? 'mn' : ''}>{val}</b>
                </div>
              ))}
            </div>
            <div className="rpt-acts">
              <button
                className="btn primary"
                disabled={busy === 'excel'}
                onClick={() => handleExcelExport(periodKey, DATASETS)}
              >
                <Icon name="dl" />
                {busy === 'excel' ? t('Preparing…') : t('Download Excel')}
              </button>
              <button className="btn" onClick={() => openView(periodKey, DATASETS)}>
                <Icon name="file" />
                {t('View full report')}
              </button>
            </div>
          </div>

          <div className="rpt-hero-r">
            <span className="rpt-eyebrow">{t('Message to send')}</span>
            <pre className="rpt-msg">{msg}</pre>
            <div className="rpt-acts">
              <button className="btn dark" onClick={handleCopyMessage}>
                <Icon name="copy" />
                {t('Copy for Telegram')}
              </button>
              <a
                className="btn"
                href={`https://wa.me/?text=${encodeURIComponent(msg)}`}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setCopiedPeriod(wr.label)}
              >
                <Icon name="chat" />
                {t('Send on WhatsApp')}
              </a>
              {copiedPeriod === wr.label && (
                <span className="rpt-ok">
                  <Icon name="check" />
                  {t('Ready to paste')}
                </span>
              )}
            </div>
            <p className="muted small">
              {t('Attach the Excel file to the message for the full details.')}
            </p>
          </div>
        </div>
      </section>

      {/* Quick Reports */}
      <div className="rpt-quick">
        {quickReports.map(([k, label, tone]) => {
          const qr = resolveReportRange(k, undefined, undefined, lang);
          const s = buildReport(students, leads, activities, qr.from, qr.to, [], lang, tr).summary;
          const figs = [
            [t('Enquiries'), s.leads],
            [t('New students'), s.students],
            isPartner
              ? [t('Collected'), `${s.collected.toLocaleString()} ETB`]
              : [t('Payments'), s.payments],
            [t('Visas approved'), s.approved]
          ];
          return (
            <article key={k} className="panel rpt-q">
              <div className="rpt-q-h" style={{ background: tone.bg, color: tone.fg }}>
                <b>{label}</b>
                <span>{qr.label}</span>
              </div>
              <div className="rpt-q-f">
                {figs.map(([a, b]) => (
                  <span key={a}>
                    <i>{a}</i>
                    <b>{b}</b>
                  </span>
                ))}
              </div>
              <div className="rpt-q-a">
                <button className="btn sm" onClick={() => openView(k, DATASETS)}>
                  <Icon name="file" />
                  {t('View')}
                </button>
                <button className="btn sm primary" onClick={() => handleExcelExport(k, DATASETS)}>
                  <Icon name="dl" />
                  {t('Excel')}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {/* 6-Month Trend Chart */}
      <TrendChart data={trend} isPartner={isPartner} />

      {/* Build your own report */}
      <section className="panel rpt-build">
        <div className="panel-h">
          <h2>{t('Build your own report')}</h2>
          <span className="muted">{t('Three steps: what, when, and the file type.')}</span>
        </div>

        <div className="rpt-steps">
          {/* Step 1: What */}
          <div>
            <StepHeader
              n={1}
              title={t('What should the report include?')}
              hint={t('Tick one or more. The number is how many rows each part has for the dates you pick.')}
            />
            <div className="rpt-pick">
              {DATASETS.map(k => {
                const on = what.includes(k);
                const info = DATASET_INFO[k];
                const tone = TONES[k];
                return (
                  <button
                    key={k}
                    aria-pressed={on}
                    className={`rpt-opt ${on ? 'on' : ''}`}
                    onClick={() =>
                      setWhat(
                        on
                          ? what.filter(x => x !== k)
                          : DATASETS.filter(x => x === k || what.includes(x))
                      )
                    }
                  >
                    <span className="rpt-box">{on && <Icon name="check" />}</span>
                    <span className="rpt-opt-ic" style={{ background: tone.bg, color: tone.fg }}>
                      <Icon name={info.icon} />
                    </span>
                    <span className="rpt-opt-t">
                      <b>{t(info.label)}</b>
                      <i>{t(info.desc)}</i>
                    </span>
                    <em>{counts[k] ?? 0}</em>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Step 2: When */}
          <div>
            <StepHeader n={2} title={t('Which dates?')} hint={cr.label} />
            <div className="rpt-chips">
              {[
                ['today', t('Today')],
                ['week', t('This week')],
                ['month', t('This month')],
                ['lastMonth', t('Last month')],
                ['year', t('This year')],
                ['custom', t('Pick dates')]
              ].map(([k, label]) => (
                <button
                  key={k}
                  className={`cchip ${customRangeKey === k ? 'on' : ''}`}
                  onClick={() => setCustomRangeKey(k)}
                >
                  {label}
                </button>
              ))}
            </div>
            {customRangeKey === 'custom' && (
              <div className="customr rpt-custom" style={{ display: 'flex', gap: 12, marginTop: 12 }}>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{t('From')}</span>
                  <DateInput
                    compact
                    value={from}
                    max={to}
                    onChange={v => v && setFrom(v)}
                    ariaLabel={t('From')}
                  />
                </label>
                <label style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                  <span>{t('To')}</span>
                  <DateInput
                    compact
                    value={to}
                    min={from}
                    onChange={v => v && setTo(v)}
                    ariaLabel={t('To')}
                  />
                </label>
              </div>
            )}
          </div>

          {/* Step 3: Format */}
          <div>
            <StepHeader n={3} title={t('What kind of file?')} />
            <div className="rpt-fmts">
              {fileFormats.map(([k, label, desc]) => (
                <button
                  key={k}
                  aria-pressed={fmt === k}
                  className={`rpt-fmt ${fmt === k ? 'on' : ''}`}
                  onClick={() => setFmt(k)}
                >
                  <b>{label}</b>
                  <i>{desc}</i>
                </button>
              ))}
            </div>
          </div>

          {/* Summary bar & Action buttons */}
          <div className="rpt-sum">
            {what.length > 0 ? (
              <p>
                <b>{fileFormats.find(x => x[0] === fmt)?.[1]}</b> · {cr.label} ·{' '}
                {what.map(k => `${t(DATASET_INFO[k].label)}: ${counts[k] ?? 0}`).join(', ')}
              </p>
            ) : (
              <p className="rpt-warn">{t('Tick at least one thing in step 1.')}</p>
            )}

            <div className="rpt-acts">
              <button
                className="btn primary"
                disabled={!what.length || !!busy}
                onClick={handleDownload}
              >
                <Icon name="dl" />
                {busy
                  ? t('Preparing…')
                  : fmt === 'excel'
                  ? t('Download Excel')
                  : fmt === 'csv'
                  ? t('Download CSV')
                  : t('Download page')}
              </button>
              <button
                className="btn"
                disabled={!what.length}
                onClick={() => openView(customRangeKey, what)}
              >
                <Icon name="file" />
                {t('Preview on screen')}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
