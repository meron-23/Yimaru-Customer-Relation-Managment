import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { StatusPill } from '../components/Pill';
import { Segmented } from '../components/Segmented';
import { StatCards, ChipBar, type StatCardItem, type ChipItem } from '../components/StatCards';
import { nextActionOf } from '../lib/next-action';
import { STAGES_LIST, STAGE_INDEX } from '../lib/sample-data';
import { PACKAGE_LABEL } from '../lib/reference-data';
import { relativeDate } from '../lib/ethiopian-calendar';
import type { Student } from '../types';

const STAGE_TONES: { bg: string; fg: string; bar: string }[] = [
  { bg: '#FDE4D2', fg: '#8A4318', bar: '#F39A5B' }, // Registration: peach
  { bg: '#DCE8FC', fg: '#24508F', bar: '#6E9EEA' }, // Assessment: sky
  { bg: '#E8DDF8', fg: '#55339A', bar: '#A386E3' }, // Onboarding: lavender
  { bg: '#F8DAF0', fg: '#8E2A7C', bar: '#DB7FC6' }, // Admission: pink
  { bg: '#FFF0A8', fg: '#735300', bar: '#F5C518' }, // Visa file: yellow
  { bg: '#CDF5EA', fg: '#0D6650', bar: '#22D3A6' }, // Submitted: aqua
  { bg: '#DFF3CD', fg: '#3B6A18', bar: '#83C45A' }  // Outcome: green
];

const STAGE_SHORT = [
  'Fee and sign-up',
  'Profile review',
  'Study plan',
  'University offers',
  'Documents and QC',
  'At the embassy',
  'Visa decision'
];

export default function Students() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'am' ? 'am' : 'en') as 'en' | 'am';
  const navigate = useNavigate();
  const { students } = useData();
  const { users } = useAuth();

  const [view, setView] = useState<'board' | 'list'>(() => {
    try {
      const saved = localStorage.getItem('yim:studentsView');
      if (saved === 'list' || saved === 'board') return saved;
    } catch {}
    return window.innerWidth >= 1000 ? 'board' : 'list';
  });

  const handleSetView = (v: string) => {
    const val = v as 'board' | 'list';
    setView(val);
    try {
      localStorage.setItem('yim:studentsView', val);
    } catch {}
  };

  const [searchQuery, setSearchQuery] = useState('');
  const [stageFilter, setStageFilter] = useState<string>('');
  const [needsFilter, setNeedsFilter] = useState(false);
  const [packageFilter, setPackageFilter] = useState<string>('');
  const [fundingFilter, setFundingFilter] = useState<string>('');
  const [archivedFilter, setArchivedFilter] = useState(false);
  const [riskFilter, setRiskFilter] = useState<string>('');
  const [officerFilter, setOfficerFilter] = useState<string>('');
  const [sortOrder, setSortOrder] = useState<string>('updated');
  const [groupBy, setGroupBy] = useState<string>('none');
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [openCols, setOpenCols] = useState<Record<string, boolean>>({});

  const needsAttention = (s: Student) => {
    const na = nextActionOf(s);
    return na.tone === 'warn' || na.tone === 'bad';
  };

  // Matcher for filtering
  const matches = (s: Student, options: { checkStage?: boolean; checkNeeds?: boolean } = {}) => {
    if (s.deleted_at) return false;
    if (!!s.archived !== !!archivedFilter) return false;
    if (options.checkStage !== false && stageFilter && s.stage !== stageFilter) return false;
    if (options.checkNeeds !== false && needsFilter && !needsAttention(s)) return false;
    if (packageFilter && s.package_type !== packageFilter) return false;
    if (fundingFilter && s.sponsor_type !== fundingFilter) return false;
    if (riskFilter && s.risk !== riskFilter) return false;
    if (officerFilter && s.officer !== officerFilter) return false;

    const q = searchQuery.trim().toLowerCase();
    if (q) {
      const textPool = [
        s.full_name,
        s.case_id,
        s.phone,
        s.strategy_country,
        ...(s.target_countries || [])
      ].map(v => String(v || '').toLowerCase());
      if (!textPool.some(v => v.includes(q))) return false;
    }
    return true;
  };

  const baseList = students.filter(s => matches(s, { checkStage: false }));
  const attentionCount = students.filter(s => matches(s, { checkNeeds: false }) && needsAttention(s)).length;

  const sortedList = [...students.filter(s => matches(s))].sort((a, b) => {
    if (sortOrder === 'name') {
      return (a.full_name || '').localeCompare(b.full_name || '');
    }
    if (sortOrder === 'stage') {
      const diff = (STAGE_INDEX[b.stage] ?? 0) - (STAGE_INDEX[a.stage] ?? 0);
      if (diff !== 0) return diff;
    }
    return (b.updated_at || '').localeCompare(a.updated_at || '');
  });

  const officerNames = Array.from(
    new Set([
      ...users.map(u => u.full_name),
      ...students.map(s => s.officer).filter(Boolean) as string[]
    ])
  );

  // 8 Cards: All + 7 steps
  const stageCards: StatCardItem[] = [
    {
      key: '',
      label: t('All students'),
      count: baseList.length,
      sub: archivedFilter ? t('Archived') : t('Active cases'),
      hero: true
    },
    ...STAGES_LIST.map((st, i) => ({
      key: st.key,
      label: `${i + 1}. ${t(st.label)}`,
      count: baseList.filter(s => s.stage === st.key).length,
      sub: t(STAGE_SHORT[i]),
      hint: t(st.hint),
      bar: STAGE_TONES[i].bar,
      fg: STAGE_TONES[i].fg,
      bg: STAGE_TONES[i].bg
    }))
  ];

  // Quick filter chips
  const quickChips: ChipItem[] = [
    {
      key: 'all',
      label: t('All'),
      on: !needsFilter && !packageFilter && fundingFilter !== 'scholarship' && !archivedFilter,
      onClick: () => {
        setNeedsFilter(false);
        setPackageFilter('');
        setFundingFilter('');
        setArchivedFilter(false);
      }
    },
    {
      key: 'need',
      label: t('Needs attention'),
      dot: '#F5C518',
      count: attentionCount,
      on: needsFilter,
      onClick: () => setNeedsFilter(v => !v)
    },
    {
      key: 'p1',
      label: t('Package 1'),
      dot: '#6E9EEA',
      on: packageFilter === 'p1',
      onClick: () => setPackageFilter(v => (v === 'p1' ? '' : 'p1'))
    },
    {
      key: 'p2',
      label: t('Package 2'),
      dot: '#DB7FC6',
      on: packageFilter === 'p2',
      onClick: () => setPackageFilter(v => (v === 'p2' ? '' : 'p2'))
    },
    {
      key: 'sch',
      label: t('Scholarship'),
      dot: '#22D3A6',
      on: fundingFilter === 'scholarship',
      onClick: () => setFundingFilter(v => (v === 'scholarship' ? '' : 'scholarship'))
    },
    {
      key: 'arc',
      label: t('Archived'),
      dot: '#3A2A36',
      on: archivedFilter,
      onClick: () => setArchivedFilter(v => !v)
    }
  ];

  const moreFilterCount =
    (riskFilter ? 1 : 0) +
    (officerFilter ? 1 : 0) +
    (fundingFilter && fundingFilter !== 'scholarship' ? 1 : 0);

  const clearAllFilters = () => {
    setSearchQuery('');
    setStageFilter('');
    setNeedsFilter(false);
    setPackageFilter('');
    setFundingFilter('');
    setArchivedFilter(false);
    setRiskFilter('');
    setOfficerFilter('');
  };

  const hasAnyFilter =
    needsFilter ||
    packageFilter ||
    fundingFilter ||
    riskFilter ||
    officerFilter ||
    archivedFilter ||
    stageFilter ||
    !!searchQuery.trim();

  // Grouping for List view
  const listGroups = (() => {
    if (view === 'board' || groupBy === 'none') {
      return [{ key: '_', label: '', items: sortedList }];
    }
    const keyOf = (s: Student) => {
      if (groupBy === 'country') return s.strategy_country || s.target_countries?.[0] || '';
      if (groupBy === 'officer') return s.officer || '';
      return s.package_type || '';
    };

    const labelOf = (k: string) => {
      if (!k) return t('Not set');
      if (groupBy === 'country') return t(k);
      if (groupBy === 'package') return t(PACKAGE_LABEL[k] || k);
      return k;
    };

    const map = new Map<string, Student[]>();
    sortedList.forEach(s => {
      const k = keyOf(s);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    });

    return [...map.entries()]
      .sort((a, b) => b[1].length - a[1].length)
      .map(([k, items]) => ({ key: k || '_none', label: labelOf(k), items }));
  })();

  const boardCols = STAGES_LIST.map((st, i) => ({
    st,
    i,
    items: sortedList.filter(s => s.stage === st.key)
  })).filter(c => !stageFilter || c.st.key === stageFilter);

  // Student card in Board view
  const StudentCard = ({ student }: { student: Student }) => {
    const i = STAGE_INDEX[student.stage] ?? 0;
    const tone = STAGE_TONES[i];
    const na = nextActionOf(student);
    const att = needsAttention(student);
    const country = student.strategy_country || student.target_countries?.[0];

    return (
      <button
        type="button"
        className={`bcard ${student.archived ? 'dim' : ''}`}
        style={
          {
            '--cb': tone.bg,
            '--cf': tone.fg,
            '--c': tone.bar
          } as React.CSSProperties
        }
        onClick={() => navigate(`/students/${student.id}`)}
      >
        <span className="bc-top">
          <b>{student.full_name || t('Unnamed')}</b>
          {att && (
            <span className="bc-att" title={t('Needs attention')}>
              <Icon name="alert" />
            </span>
          )}
        </span>
        <span className="bc-id">{student.case_id}</span>
        <span className="bc-dash">
          {STAGES_LIST.map((s2, j) => (
            <i key={s2.key} className={j < i ? 'd' : j === i ? 'c' : ''} />
          ))}
        </span>
        <span className="bc-next">{t(na.short || na.long)}</span>
        <span className="bc-foot">
          {student.officer ? (
            <Avatar name={student.officer} size={26} />
          ) : (
            <span className="bc-noav" />
          )}
          <span className="bc-ct">{country ? t(country) : t('No destination yet')}</span>
          <span className="bc-up">{relativeDate(student.updated_at, lang)}</span>
        </span>
      </button>
    );
  };

  return (
    <div className="pg">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('Students')}</h1>
          <p className="page-sub">
            {t('Every student moves through 7 steps, from registration to the visa decision.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <Segmented
            items={[
              ['board', t('Board')],
              ['list', t('List')]
            ]}
            value={view}
            onChange={handleSetView}
          />
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/students/new')}
          >
            <Icon name="plus" />
            <span>{t('New case')}</span>
          </button>
        </div>
      </div>

      {/* 8 Step Cards */}
      <StatCards
        items={stageCards}
        value={stageFilter}
        onChange={k => setStageFilter(stageFilter === k && k ? '' : k)}
        className="stage8"
      />

      {/* Filter Bar */}
      <div className="tbar">
        <ChipBar items={quickChips} />

        <div className="fpop-w">
          <button
            type="button"
            className={`cchip ${moreFilterCount ? 'on' : ''}`}
            onClick={() => setIsMoreOpen(v => !v)}
            aria-expanded={isMoreOpen}
          >
            <Icon name="filter" />
            <span>{t('More filters')}</span>
            {moreFilterCount > 0 && <em>{moreFilterCount}</em>}
          </button>

          {isMoreOpen && (
            <>
              <div className="fpop-bg" onClick={() => setIsMoreOpen(false)} />
              <div className="fpop" role="dialog" aria-label={t('More filters')}>
                <div className="fpop-h">
                  <b>{t('More filters')}</b>
                  <button
                    type="button"
                    className="ib"
                    onClick={() => setIsMoreOpen(false)}
                    aria-label={t('Close')}
                  >
                    <Icon name="close" />
                  </button>
                </div>

                <label className="field">
                  <span className="field-lbl">{t('Funding')}</span>
                  <select
                    className="select"
                    value={fundingFilter}
                    onChange={e => setFundingFilter(e.target.value)}
                  >
                    <option value="">{t('Any funding')}</option>
                    <option value="scholarship">{t('Scholarship')}</option>
                    <option value="self">{t('Self-sponsored')}</option>
                  </select>
                </label>

                <label className="field">
                  <span className="field-lbl">{t('Risk')}</span>
                  <select
                    className="select"
                    value={riskFilter}
                    onChange={e => setRiskFilter(e.target.value)}
                  >
                    <option value="">{t('Any risk')}</option>
                    <option value="strong">{t('Strong')}</option>
                    <option value="improve">{t('Needs improvement')}</option>
                    <option value="high">{t('High risk')}</option>
                  </select>
                </label>

                <label className="field">
                  <span className="field-lbl">{t('Officer')}</span>
                  <select
                    className="select"
                    value={officerFilter}
                    onChange={e => setOfficerFilter(e.target.value)}
                  >
                    <option value="">{t('Anyone')}</option>
                    {officerNames.map(name => (
                      <option key={name} value={name}>{name}</option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field-lbl">{t('Sort')}</span>
                  <select
                    className="select"
                    value={sortOrder}
                    onChange={e => setSortOrder(e.target.value)}
                  >
                    <option value="updated">{t('Recently updated')}</option>
                    <option value="name">{t('Name (A–Z)')}</option>
                    <option value="stage">{t('Furthest along')}</option>
                  </select>
                </label>

                <div className="fpop-f">
                  <button
                    type="button"
                    className="btn"
                    onClick={() => {
                      setRiskFilter('');
                      setOfficerFilter('');
                      if (fundingFilter !== 'scholarship') setFundingFilter('');
                    }}
                  >
                    {t('Reset')}
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={() => setIsMoreOpen(false)}
                  >
                    {t('Show {n} students', { n: sortedList.length })}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {view === 'list' && (
          <div className="grp">
            <span>{t('Group by')}</span>
            <Segmented
              items={[
                ['none', t('No grouping')],
                ['country', t('Destination')],
                ['officer', t('Officer')],
                ['package', t('Package')]
              ]}
              value={groupBy}
              onChange={setGroupBy}
            />
          </div>
        )}

        <div className="sbox" style={{ maxWidth: 220, marginLeft: 'auto' }}>
          <Icon name="search" />
          <input
            placeholder={t('Search students')}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              type="button"
              className="ib"
              onClick={() => setSearchQuery('')}
              aria-label={t('Clear search')}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
      </div>

      {/* Active Filter Chips */}
      {(riskFilter || officerFilter || (fundingFilter && fundingFilter !== 'scholarship')) && (
        <div className="chips">
          {fundingFilter && fundingFilter !== 'scholarship' && (
            <button
              type="button"
              className="chip"
              onClick={() => setFundingFilter('')}
            >
              {t(fundingFilter === 'self' ? 'Self-sponsored' : fundingFilter)}
              <Icon name="close" />
            </button>
          )}
          {riskFilter && (
            <button
              type="button"
              className="chip"
              onClick={() => setRiskFilter('')}
            >
              {t('Risk: {r}', {
                r: t(riskFilter === 'strong' ? 'Strong' : riskFilter === 'improve' ? 'Needs improvement' : 'High risk')
              })}
              <Icon name="close" />
            </button>
          )}
          {officerFilter && (
            <button
              type="button"
              className="chip"
              onClick={() => setOfficerFilter('')}
            >
              {officerFilter}
              <Icon name="close" />
            </button>
          )}
          <button type="button" className="linkbtn" onClick={clearAllFilters}>
            {t('Clear all')}
          </button>
        </div>
      )}

      {/* Main Content: Board View or List View */}
      {sortedList.length === 0 ? (
        <div className="empty">
          <span className="empty-ic"><Icon name="users" /></span>
          <h3>{t('No students here')}</h3>
          <p>
            {hasAnyFilter
              ? t('No student matches these filters. Remove one to see more.')
              : stageFilter
              ? t('No student is at this step right now.')
              : t('Create the first case, or register one from a lead.')}
          </p>
          {hasAnyFilter ? (
            <button type="button" className="btn btn-outline" onClick={clearAllFilters}>
              {t('Clear filters')}
            </button>
          ) : (
            !stageFilter && (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => navigate('/students/new')}
              >
                <Icon name="plus" />
                <span>{t('New case')}</span>
              </button>
            )
          )}
        </div>
      ) : view === 'board' ? (
        <div className={`board ${stageFilter ? 'one' : ''}`}>
          {boardCols.map(({ st, i, items }) => (
            <section
              key={st.key}
              className="bcol"
              style={
                {
                  '--c': STAGE_TONES[i].bar,
                  '--cf': STAGE_TONES[i].fg
                } as React.CSSProperties
              }
            >
              <header className="bcol-h">
                <span className="bcol-n">{i + 1}</span>
                <b>{t(st.label)}</b>
                <em>{items.length}</em>
              </header>
              <p className="bcol-s">{t(STAGE_SHORT[i])}</p>
              <div className="bcol-b">
                {items.length === 0 ? (
                  <div className="bempty">{t('No one at this step')}</div>
                ) : (
                  (stageFilter || openCols[st.key] ? items : items.slice(0, 6)).map(x => (
                    <StudentCard key={x.id} student={x} />
                  ))
                )}
                {!stageFilter && items.length > 6 && (
                  <button
                    type="button"
                    className="bmore"
                    onClick={() =>
                      setOpenCols(prev => ({ ...prev, [st.key]: !prev[st.key] }))
                    }
                  >
                    {openCols[st.key]
                      ? t('Show fewer')
                      : t('Show all {n}', { n: items.length })}
                  </button>
                )}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="lgroups">
          {listGroups.map(g => (
            <section key={g.key} className="lgrp">
              {g.label && (
                <h3 className="ldg-h">
                  <span>{g.label}</span>
                  <em>{g.items.length}</em>
                </h3>
              )}
              <div className="slist" role="list">
                {g.items.map(s => {
                  const na = nextActionOf(s);
                  const country = s.strategy_country || s.target_countries?.[0];
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className="slr"
                      onClick={() => navigate(`/students/${s.id}`)}
                    >
                      <Avatar name={s.full_name} size={36} />
                      <span className="sl-who">
                        <b>{s.full_name}</b>
                        <i>{s.case_id}</i>
                      </span>
                      <span className="sl-stage">
                        <span className={`stagetag s-${s.stage}`}>
                          {t(STAGES_LIST[STAGE_INDEX[s.stage]]?.label || s.stage)}
                        </span>
                      </span>
                      <StatusPill student={s} />
                      <span className="sl-next">{t(na.short || na.long)}</span>
                      <span className="sl-ct">{country ? t(country) : '—'}</span>
                      <span className="sl-of">
                        {s.officer ? <Avatar name={s.officer} size={28} /> : null}
                      </span>
                      <Icon name="right" />
                    </button>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
