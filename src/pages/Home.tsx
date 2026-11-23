import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { todayIso, addDays, ethLong, dmy } from '../lib/ethiopian-calendar';
import { leadBucket } from '../lib/leads';
import { STAGES_LIST, STAGE_INDEX } from '../lib/sample-data';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { DateInput } from '../components/DateInput';
import RankList from '../components/RankList';
import type { Student } from '../types';

const STAGE_RAMP = [
  '#DFD3F4', // registration
  '#D4E5FA', // assessment
  '#CBEFDE', // onboarding
  '#FBE49D', // admission
  '#F6C196', // visafile
  '#F5BAC9', // submitted
  '#CBD0E0'  // outcome
];

type TodoKind = 'call' | 'money' | 'file';

interface TodoItem {
  kind: TodoKind;
  name: string;
  detail: string;
  tag: string;
  urgent?: boolean;
  on: () => void;
}

export default function Home() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language as 'en' | 'am') || 'en';
  const navigate = useNavigate();
  const { currentUser, isPartner } = useAuth();
  const { students, leads, settings, destinationPrices } = useData();

  const today = todayIso();
  const [range, setRange] = useState<string>('month');
  const [from, setFrom] = useState(addDays(today, -30));
  const [to, setTo] = useState(today);
  const [kind, setKind] = useState<string>('all');
  const [showAll, setShowAll] = useState(false);

  // Greeting
  const hour = new Date().getHours();
  const greeting = hour < 12 ? t('Good morning') : hour < 17 ? t('Good afternoon') : t('Good evening');
  const firstName = currentUser?.full_name?.split(' ')[0] || '';
  const dateStr = ethLong(today, lang, { year: true, weekday: true });

  const lo = from <= to ? from : to;
  const hi = from <= to ? to : from;

  const rangeLabel = useMemo(() => {
    switch (range) {
      case 'today':
        return t('today');
      case 'week':
        return t('in the last 7 days');
      case 'month':
        return t('in the last 30 days');
      case 'year':
        return t('in the last 12 months');
      case 'all':
        return t('all time');
      case 'custom':
        return t('from {a} to {b}', { a: dmy(lo), b: dmy(hi) });
      default:
        return '';
    }
  }, [range, lo, hi, t]);

  const [startTs, endTs] = useMemo(() => {
    const d = new Date();
    if (range === 'custom') {
      const e = new Date(hi + 'T23:59:59.999');
      return [new Date(lo + 'T00:00:00').getTime(), e.getTime()];
    }
    if (range === 'today') {
      d.setHours(0, 0, 0, 0);
      return [d.getTime(), Infinity];
    }
    if (range === 'week') {
      d.setDate(d.getDate() - 7);
      return [d.getTime(), Infinity];
    }
    if (range === 'month') {
      d.setDate(d.getDate() - 30);
      return [d.getTime(), Infinity];
    }
    if (range === 'year') {
      d.setFullYear(d.getFullYear() - 1);
      return [d.getTime(), Infinity];
    }
    return [0, Infinity];
  }, [range, lo, hi]);

  const inRange = (iso?: string | null) => {
    if (!iso) return false;
    const tVal = new Date(iso).getTime();
    return tVal >= startTs && tVal < endTs;
  };

  // Active cases & filters
  const activeStudents = useMemo(() => students.filter(s => !s.archived && !s.deleted_at), [students]);
  const newCasesInRange = useMemo(() => activeStudents.filter(s => range === 'all' || inRange(s.created_at)).length, [activeStudents, range, inRange]);

  const openLeads = useMemo(() => leads.filter(l => l.status === 'open'), [leads]);
  const overdueLeads = useMemo(() => openLeads.filter(l => leadBucket(l, today) === 'overdue'), [openLeads, today]);
  const dueTodayLeads = useMemo(() => openLeads.filter(l => leadBucket(l, today) === 'today'), [openLeads, today]);

  const enquiriesInRange = useMemo(() => leads.filter(l => range === 'all' || inRange(l.created_at)), [leads, range, inRange]);
  const registeredInRange = useMemo(() => enquiriesInRange.filter(l => l.status === 'converted').length, [enquiriesInRange]);

  const destCountry = (s: Student) => s.strategy_country || s.target_countries?.[0] || 'Not set';

  // Fee calculation helper
  const feeFor = (student: Student, key: 'registration' | 'payment1' | 'payment2') => {
    if (key === 'registration') {
      return student.package_type === 'p1' ? settings.p1_registration || 10000 : settings.p2_registration || 10000;
    }
    const country = destCountry(student);
    const dest = destinationPrices.find(d => d.country.toLowerCase() === country.toLowerCase());
    if (key === 'payment1') return dest?.payment1 || 150000;
    if (key === 'payment2') return dest?.payment2 || 150000;
    return 0;
  };

  const getPayment = (s: Student, kind: 'registration' | 'payment1' | 'payment2') =>
    s.payments?.find(p => p.kind === kind);

  // Payments due
  const regDue = useMemo(
    () => activeStudents.filter(s => s.stage === 'registration' && !getPayment(s, 'registration')?.paid),
    [activeStudents]
  );

  const milestoneDue = useMemo(() => {
    const list: Array<{ student: Student; key: 'payment1' | 'payment2' }> = [];
    activeStudents.forEach(s => {
      const idx = STAGE_INDEX[s.stage];
      if (idx >= STAGE_INDEX.admission && !getPayment(s, 'payment1')?.paid) {
        list.push({ student: s, key: 'payment1' });
      }
      if (s.package_type === 'p2' && idx >= STAGE_INDEX.outcome && s.decision === 'approved' && !getPayment(s, 'payment2')?.paid) {
        list.push({ student: s, key: 'payment2' });
      }
    });
    return list;
  }, [activeStudents]);

  const dueTotal = useMemo(() => {
    const regSum = regDue.reduce((sum, s) => sum + feeFor(s, 'registration'), 0);
    const mileSum = milestoneDue.reduce((sum, m) => sum + feeFor(m.student, m.key), 0);
    return regSum + mileSum;
  }, [regDue, milestoneDue, settings, destinationPrices]);

  // Needs QC & waiting on embassy
  const atQc = useMemo(() => activeStudents.filter(s => s.stage === 'visafile' && !s.qc_passed), [activeStudents]);
  const atEmbassy = useMemo(() => activeStudents.filter(s => s.stage === 'submitted'), [activeStudents]);

  // To-do items
  const todoItems = useMemo<TodoItem[]>(() => {
    const items: TodoItem[] = [
      ...overdueLeads.map(l => ({
        kind: 'call' as TodoKind,
        name: l.name || t('Unnamed'),
        detail: t('Call {n}', { n: l.call_attempts + 1 }),
        tag: t('Late, {d}', { d: dmy(l.next_call_on) }),
        urgent: true,
        on: () => navigate('/leads')
      })),
      ...dueTodayLeads.map(l => ({
        kind: 'call' as TodoKind,
        name: l.name || t('Unnamed'),
        detail: l.call_attempts === 0 ? t('First call') : t('Call {n}', { n: l.call_attempts + 1 }),
        tag: t('Today'),
        on: () => navigate('/leads')
      })),
      ...regDue.map(s => ({
        kind: 'money' as TodoKind,
        name: s.full_name || t('Unnamed'),
        detail: t('Registration fee'),
        tag: t('Blocks start'),
        urgent: true,
        on: () => navigate(`/students/${s.id}`)
      })),
      ...milestoneDue.map(({ student, key }) => ({
        kind: 'money' as TodoKind,
        name: student.full_name || t('Unnamed'),
        detail: key === 'payment1' ? t('Payment 1 (admission)') : t('Payment 2 (visa)'),
        tag: `${feeFor(student, key).toLocaleString()} ${settings.currency || 'ETB'}`,
        on: () => navigate(`/students/${student.id}`)
      })),
      ...atQc.map(s => ({
        kind: 'file' as TodoKind,
        name: s.full_name || t('Unnamed'),
        detail: t('Visa file needs QC sign-off'),
        tag: t(destCountry(s)),
        on: () => navigate(`/students/${s.id}`)
      })),
      ...atEmbassy.map(s => ({
        kind: 'file' as TodoKind,
        name: s.full_name || t('Unnamed'),
        detail: t('Waiting on the embassy'),
        tag: t(destCountry(s)),
        on: () => navigate(`/students/${s.id}`)
      }))
    ];
    return items;
  }, [overdueLeads, dueTodayLeads, regDue, milestoneDue, atQc, atEmbassy, settings, destinationPrices, t, navigate]);

  const shownTodos = useMemo(() => {
    return todoItems.filter(item => kind === 'all' || item.kind === kind);
  }, [todoItems, kind]);

  const visibleTodos = showAll ? shownTodos : shownTodos.slice(0, 8);

  // Destinations tally
  const destRows = useMemo(() => {
    const map = new Map<string, number>();
    activeStudents.forEach(s => {
      const c = destCountry(s);
      map.set(c, (map.get(c) || 0) + 1);
    });
    return [...map.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 7)
      .map(([country, count]) => ({
        key: country,
        label: t(country),
        n: count
      }));
  }, [activeStudents, t]);

  // Source tally
  const srcRows = useMemo(() => {
    const map = new Map<string, { total: number; converted: number }>();
    enquiriesInRange.forEach(l => {
      const s = l.source || 'Unknown';
      const cur = map.get(s) || { total: 0, converted: 0 };
      cur.total++;
      if (l.status === 'converted') cur.converted++;
      map.set(s, cur);
    });
    return [...map.entries()]
      .sort((a, b) => b[1].total - a[1].total)
      .map(([src, val]) => ({
        key: src,
        label: t(src),
        n: val.total,
        sub: t('{r} registered', { r: val.converted })
      }));
  }, [enquiriesInRange, t]);

  // Ranges definition
  const rangeOptions: [string, string][] = [
    ['today', t('Today')],
    ['week', t('7 days')],
    ['month', t('30 days')],
    ['year', t('12 months')],
    ['all', t('All time')],
    ['custom', t('Custom')]
  ];

  const kindOptions: [string, string][] = [
    ['all', t('All')],
    ['call', t('Calls')],
    ['money', t('Payments')],
    ['file', t('Visa files')]
  ];

  return (
    <div className="pg">
      <header className="page-head">
        <div>
          <h1 className="page-head-t">{greeting}{firstName ? `, ${firstName}` : ''} 👋</h1>
          <p className="page-head-s">{dateStr}</p>
        </div>
        <div className="rangebox">
          <Segmented items={rangeOptions} value={range} onChange={setRange} />
          {range === 'custom' && (
            <div className="customr" style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                <span>{t('From')}</span>
                <DateInput
                  compact
                  value={from}
                  max={to < today ? to : today}
                  onChange={(v: string | null) => v && setFrom(v)}
                  ariaLabel={t('From')}
                />
              </label>
              <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13, color: 'var(--ink3)' }}>
                <span>{t('To')}</span>
                <DateInput
                  compact
                  value={to}
                  min={from}
                  max={today}
                  onChange={(v: string | null) => v && setTo(v)}
                  ariaLabel={t('To')}
                />
              </label>
            </div>
          )}
        </div>
      </header>

      {/* KPI Cards */}
      <div className="kpis">
        <button
          className="kpi"
          style={{ background: '#E8DDF8', color: '#3E1F58' }}
          onClick={() => navigate('/students')}
        >
          <span className="kpi-t">
            <span className="kpi-l">
              <Icon name="users" />
              {t('Active cases')}
            </span>
            <span className="kpi-go"><Icon name="arrowUR" /></span>
          </span>
          <b>{activeStudents.length}</b>
          <span className="kpi-c">
            {t('{n} opened {range}', { n: newCasesInRange, range: rangeLabel })}
          </span>
        </button>

        <button
          className="kpi"
          style={{ background: '#CDF5EA', color: '#004D40' }}
          onClick={() => navigate('/leads')}
        >
          <span className="kpi-t">
            <span className="kpi-l">
              <Icon name="chat" />
              {t('New enquiries')}
            </span>
            <span className="kpi-go"><Icon name="arrowUR" /></span>
          </span>
          <b>{enquiriesInRange.length}</b>
          <span className="kpi-c">
            {t('{n} registered so far', { n: registeredInRange })}
          </span>
        </button>

        <button
          className="kpi"
          style={{ background: '#FFF0A8', color: '#5C4300' }}
          onClick={() => navigate('/leads')}
        >
          <span className="kpi-t">
            <span className="kpi-l">
              <Icon name="phone" />
              {t('Calls to make')}
            </span>
            <span className="kpi-go"><Icon name="arrowUR" /></span>
          </span>
          <b>{overdueLeads.length + dueTodayLeads.length}</b>
          <span className={`kpi-c ${overdueLeads.length > 0 ? 'warn' : ''}`}>
            {overdueLeads.length > 0 ? t('{n} overdue', { n: overdueLeads.length }) : t('All on schedule')}
          </span>
        </button>

        <button
          className="kpi"
          style={{ background: '#F8DAF0', color: '#6E1F60' }}
          onClick={() => navigate('/students?filter=attention')}
        >
          <span className="kpi-t">
            <span className="kpi-l">
              <Icon name="money" />
              {t('Payments due')}
            </span>
            <span className="kpi-go"><Icon name="arrowUR" /></span>
          </span>
          <b>{regDue.length + milestoneDue.length}</b>
          <span className="kpi-c">
            {isPartner
              ? (dueTotal > 0 ? `${dueTotal.toLocaleString()} ${settings.currency || 'ETB'} ${t('outstanding')}` : `0 ${settings.currency || 'ETB'}`)
              : t('{a} registration, {b} milestone', { a: regDue.length, b: milestoneDue.length })}
          </span>
        </button>
      </div>

      {/* Grid: To-do left, Pipeline + Rankings right */}
      <div className="dgrid">
        <section className="panel">
          <div className="panel-h">
            <h2>{t('To do')}</h2>
            <span className="cnt">{shownTodos.length}</span>
            <div className="panel-x">
              <Segmented
                items={kindOptions}
                value={kind}
                onChange={(k: string) => {
                  setKind(k);
                  setShowAll(false);
                }}
              />
            </div>
          </div>

          {visibleTodos.length === 0 ? (
            <div className="empty-s">
              <Icon name="check" />
              <p>{t('Nothing waiting here. New calls and payments will show up as they fall due.')}</p>
            </div>
          ) : (
            <div className="tlist">
              {visibleTodos.map((x, i) => (
                <button key={i} className="trow" onClick={x.on}>
                  <span
                    className={`ttype k-${x.kind}`}
                    title={x.kind === 'call' ? t('Call') : x.kind === 'money' ? t('Payment') : t('Visa file')}
                  >
                    <Icon name={x.kind === 'call' ? 'phone' : x.kind === 'money' ? 'money' : 'file'} />
                  </span>
                  <span className="tmain">
                    <b>{x.name}</b>
                    <span>{x.detail}</span>
                  </span>
                  <span className={`tdue ${x.urgent ? 'u' : ''}`}>{x.tag}</span>
                  <Icon name="right" />
                </button>
              ))}
            </div>
          )}

          {shownTodos.length > 8 && (
            <button className="more" onClick={() => setShowAll(v => !v)}>
              {showAll ? t('Show fewer') : t('Show all {n}', { n: shownTodos.length })}
            </button>
          )}
        </section>

        <div className="dcol">
          {/* Pipeline */}
          <section className="panel">
            <div className="panel-h">
              <h2>{t('Pipeline')}</h2>
              <span className="cnt">{activeStudents.length}</span>
            </div>
            <div className="stack">
              {STAGES_LIST.map((s, i) => {
                const count = activeStudents.filter(x => x.stage === s.key).length;
                return count > 0 ? (
                  <span
                    key={s.key}
                    style={{ flex: count, background: STAGE_RAMP[i] }}
                    title={`${t(s.label)}: ${count}`}
                  />
                ) : null;
              })}
            </div>
            <div className="legend">
              {STAGES_LIST.map((s, i) => {
                const count = activeStudents.filter(x => x.stage === s.key).length;
                return (
                  <button
                    key={s.key}
                    className="lg"
                    onClick={() => navigate(`/students?stage=${s.key}`)}
                  >
                    <i style={{ background: STAGE_RAMP[i] }} />
                    <span>{t(s.label)}</span>
                    <b>{count}</b>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Destinations */}
          <section className="panel">
            <div className="panel-h">
              <h2>{t('Destinations')}</h2>
            </div>
            <RankList
              rows={destRows}
              color="#A386E3"
              empty={t('No active students yet.')}
            />
          </section>

          {/* Where enquiries come from */}
          <section className="panel">
            <div className="panel-h">
              <h2>{t('Where enquiries come from')}</h2>
            </div>
            <RankList
              rows={srcRows}
              color="#22D3A6"
              empty={t('No enquiries {r}.', { r: rangeLabel })}
            />
          </section>
        </div>
      </div>
    </div>
  );
}
