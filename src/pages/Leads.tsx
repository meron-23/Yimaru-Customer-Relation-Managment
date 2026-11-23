import React, { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { Pill } from '../components/Pill';
import { DateInput } from '../components/DateInput';
import { ComboBox } from '../components/ComboBox';
import { StatCards, type StatCardItem } from '../components/StatCards';
import { todayIso, dmy, ethLong, relativeDate } from '../lib/ethiopian-calendar';
import { leadBucket, waLink } from '../lib/leads';
import {
  COUNTRY_NAMES,
  SOURCES,
  PACKAGE_LABEL,
  EDUCATION_LEVELS,
  INTAKES,
  GOALS,
  LEAD_OUTCOMES,
  CLOSE_REASONS
} from '../lib/reference-data';
import type { Lead, LeadBucket } from '../types';

export default function Leads() {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'am' ? 'am' : 'en') as 'en' | 'am';
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const {
    leads,
    settings,
    logCall,
    convertLeadToCase,
    reopenLead,
    deleteLead
  } = useData();

  const today = todayIso();
  const cadence = settings.cadence?.length ? settings.cadence : [0, 1, 3, 7, 14];
  const maxCalls = cadence.length;

  const [tab, setTab] = useState<string>('all');
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(searchParams.get('id'));
  const [isNewLeadOpen, setIsNewLeadOpen] = useState(searchParams.get('new') === '1');
  const [mobilePanelOpen, setMobilePanelOpen] = useState(false);

  // Call logging state inside panel
  const [logMode, setLogMode] = useState<'answered' | null>(null);
  const [logNote, setLogNote] = useState('');
  const [answeredNextDate, setAnsweredNextDate] = useState(() => {
    const d = new Date(today + 'T00:00:00');
    d.setDate(d.getDate() + 2);
    return d.toISOString().slice(0, 10);
  });
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Sync selection with query params
  useEffect(() => {
    const qId = searchParams.get('id');
    if (qId && qId !== selectedId) {
      setSelectedId(qId);
      setMobilePanelOpen(true);
    }
    if (searchParams.get('new') === '1') {
      setIsNewLeadOpen(true);
    }
  }, [searchParams]);

  const stateOf = (l: Lead): LeadBucket => {
    if (l.status === 'converted') return 'converted';
    if (l.status === 'closed') return 'closed';
    return leadBucket(l, today);
  };

  const matchesTab = (l: Lead, k: string): boolean => {
    if (l.deleted_at) return false;
    if (k === 'all') return true;
    if (k === 'new') return l.status === 'open' && l.call_attempts === 0;
    if (k === 'converted') return l.status === 'converted';
    if (k === 'closed') return l.status === 'closed';
    const b = leadBucket(l, today);
    return l.status === 'open' && b === k;
  };

  const tabs: StatCardItem[] = [
    {
      key: 'all',
      label: t('All leads'),
      count: leads.filter(l => !l.deleted_at).length,
      sub: t('Every enquiry'),
      hero: true
    },
    {
      key: 'today',
      label: t('Call today'),
      count: leads.filter(l => matchesTab(l, 'today')).length,
      sub: t('Due today'),
      bar: '#6E9EEA',
      fg: '#24508F',
      bg: '#DCE8FC'
    },
    {
      key: 'overdue',
      label: t('Overdue'),
      count: leads.filter(l => matchesTab(l, 'overdue')).length,
      sub: t('Call these first'),
      bar: '#F39A5B',
      fg: '#9A4A16',
      bg: '#FDE4D2'
    },
    {
      key: 'new',
      label: t('Not called yet'),
      count: leads.filter(l => matchesTab(l, 'new')).length,
      sub: t('Fresh enquiries'),
      bar: '#A386E3',
      fg: '#55339A',
      bg: '#E8DDF8'
    },
    {
      key: 'converted',
      label: t('Registered'),
      count: leads.filter(l => matchesTab(l, 'converted')).length,
      sub: t('Became cases'),
      bar: '#22D3A6',
      fg: '#0D6650',
      bg: '#CDF5EA'
    },
    {
      key: 'closed',
      label: t('Closed'),
      count: leads.filter(l => matchesTab(l, 'closed')).length,
      sub: t('No longer active'),
      bar: '#B9B0B6',
      fg: '#5B5158',
      bg: '#EEEAEC'
    }
  ];

  const qClean = query.trim().toLowerCase();
  let filteredLeads = leads.filter(l => matchesTab(l, tab));

  if (qClean) {
    filteredLeads = filteredLeads.filter(l =>
      [l.name, l.phone, l.code, l.interest_country, l.telegram]
        .some(v => (v || '').toLowerCase().includes(qClean))
    );
  }

  // Sort newest first
  filteredLeads.sort((a, b) => (b.created_at || '').localeCompare(a.created_at || ''));

  // Group by created day
  interface LeadGroup {
    d: string;
    items: Lead[];
  }
  const groups: LeadGroup[] = [];
  filteredLeads.forEach(l => {
    const d = (l.created_at || '').slice(0, 10);
    const last = groups[groups.length - 1];
    if (last && last.d === d) {
      last.items.push(l);
    } else {
      groups.push({ d, items: [l] });
    }
  });

  const selectedLead = leads.find(l => l.id === selectedId && !l.deleted_at) || null;

  useEffect(() => {
    setLogMode(null);
    setLogNote('');
    setConfirmDelete(false);
  }, [selectedLead?.id]);

  function getLeadPillTone(st: LeadBucket): string {
    switch (st) {
      case 'uncalled': return 'magenta';
      case 'today': return 'teal';
      case 'overdue': return 'amber';
      case 'waiting': return 'purple';
      case 'closed': return 'grey';
      case 'converted': return 'green';
      default: return 'grey';
    }
  }

  function getLeadPillLabel(st: LeadBucket): string {
    switch (st) {
      case 'uncalled': return t('Call now');
      case 'today': return t('Call today');
      case 'overdue': return t('Overdue');
      case 'waiting': return t('Waiting');
      case 'closed': return t('Closed');
      case 'converted': return t('Registered');
      default: return '';
    }
  }

  function formatNextCall(l: Lead): string {
    if (l.status === 'converted') {
      return l.converted_case_id ? t('Registered as {id}', { id: l.converted_case_id }) : t('Registered');
    }
    if (l.status === 'closed') {
      return t(CLOSE_REASONS[l.close_reason || 'other'] || 'Closed');
    }
    const n = l.call_attempts + 1;
    const isLast = n >= maxCalls;
    const callText = isLast ? t('Call {n}, the last one', { n }) : t('Call {n}', { n });
    const d = l.next_call_on || today;

    if (d < today) return `${callText}, ${t('was due')} ${relativeDate(d, lang)}`;
    if (d === today) return l.call_attempts === 0 ? t('First call, today') : `${callText}, ${t('today')}`;
    return `${callText} ${t('on')} ${dmy(d)}`;
  }

  function handleLogCall(outcome: 'no_answer' | 'answered' | 'not_interested' | 'out_of_scope') {
    if (!selectedLead) return;
    logCall(selectedLead.id, outcome, logNote, outcome === 'answered' ? answeredNextDate : undefined);
    setLogNote('');
    setLogMode(null);
  }

  function handleConvert(lead: Lead) {
    const stu = convertLeadToCase(lead.id);
    if (stu) {
      navigate(`/students/${stu.id}`);
    }
  }

  const tgUrl = selectedLead?.telegram ? `https://t.me/${selectedLead.telegram.replace(/^@/, '')}` : null;
  const waUrl = selectedLead ? waLink(selectedLead.phone) : null;
  const planSummary = cadence.map(d => (d === 0 ? t('Same day') : t('day {n}', { n: d }))).join(lang === 'am' ? '፣ ' : ', ');

  return (
    <div className="pg">
      {/* Header */}
      <div className="page-head">
        <div>
          <h1 className="page-title">{t('Leads')}</h1>
          <p className="page-sub">
            {t('Call plan')}: {planSummary}. {t('A lead closes after {n} unanswered calls.', { n: maxCalls })}
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setIsNewLeadOpen(true)}
        >
          <Icon name="plus" />
          <span>{t('New lead')}</span>
        </button>
      </div>

      {/* 6 Stat Filter Cards */}
      <StatCards
        items={tabs}
        value={tab}
        onChange={k => {
          setTab(k);
          setSelectedId(null);
          setMobilePanelOpen(false);
        }}
        className="lead6"
      />

      {/* Filter / Search Bar */}
      <div className="fbar">
        <div className="sbox">
          <Icon name="search" />
          <input
            placeholder={t('Search name, phone, lead number or country')}
            value={query}
            onChange={e => setQuery(e.target.value)}
          />
          {query && (
            <button
              type="button"
              className="ib"
              onClick={() => setQuery('')}
              aria-label={t('Clear search')}
            >
              <Icon name="close" />
            </button>
          )}
        </div>
        <span className="fbar-n">
          {t('{n} leads', { n: filteredLeads.length })}
        </span>
      </div>

      {/* Split view: Leads list on left, Details panel on right */}
      <div className={`split ${selectedLead ? 'has-sel' : ''}`}>
        <div className="split-l">
          {filteredLeads.length === 0 ? (
            <div className="empty">
              <span className="empty-ic"><Icon name="phone" /></span>
              <h3>{query ? t('No leads match') : t('Nothing in this list')}</h3>
              <p>{query ? t('Try a different name or number.') : t('New enquiries show up under All and Call today straight away.')}</p>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => setIsNewLeadOpen(true)}
              >
                <Icon name="plus" />
                <span>{t('New lead')}</span>
              </button>
            </div>
          ) : (
            <div className="ldl">
              {groups.map(g => (
                <section key={g.d} className="ldg">
                  <h3 className="ldg-h">
                    <span>{relativeDate(g.d, lang) || dmy(g.d)}</span>
                    <em>{g.items.length}</em>
                  </h3>
                  <div className="ldg-b">
                    {g.items.map(l => {
                      const st = stateOf(l);
                      const isSel = selectedLead?.id === l.id;
                      return (
                        <button
                          key={l.id}
                          type="button"
                          className={`ldr s-${st} ${isSel ? 'sel' : ''}`}
                          onClick={() => {
                            setSelectedId(l.id);
                            setMobilePanelOpen(true);
                          }}
                        >
                          <Avatar name={l.name || '?'} size={38} />
                          <span className="ldr-who">
                            <b>{l.name || t('Unnamed')}</b>
                            <i>{l.code}{l.source ? ` · ${t(l.source)}` : ''}</i>
                          </span>
                          <span className="ldr-int">
                            <Icon name="globe" />
                            <span>{l.interest_country ? t(l.interest_country) : t('Not sure yet')}</span>
                            {l.interest_package && (
                              <em className={`pkgtag ${l.interest_package}`}>
                                {t(PACKAGE_LABEL[l.interest_package] || l.interest_package)}
                              </em>
                            )}
                          </span>
                          <span
                            className="ldr-calls"
                            title={t('{a} of {b} calls made', { a: l.call_attempts, b: maxCalls })}
                          >
                            <span className="dots">
                              {Array.from({ length: maxCalls }, (_, i) => (
                                <i key={i} className={i < l.call_attempts ? 'on' : ''} />
                              ))}
                            </span>
                          </span>
                          <span className="ldr-next">
                            <Pill tone={getLeadPillTone(st)}>{getLeadPillLabel(st)}</Pill>
                            <i>{formatNextCall(l)}</i>
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

        {/* Lead Panel (Right side / Full-screen phone) */}
        {selectedLead ? (
          <aside className={`lp ${mobilePanelOpen ? 'open' : ''}`}>
            <div className="lp-top">
              <button
                type="button"
                className="ib lp-back"
                onClick={() => {
                  setMobilePanelOpen(false);
                  setSelectedId(null);
                }}
                aria-label={t('Back to list')}
              >
                <Icon name="back" />
              </button>
              <Avatar name={selectedLead.name || '?'} size={46} />
              <div className="lp-t">
                <h2>{selectedLead.name || t('Unnamed')}</h2>
                <span>
                  {t('{c}, logged {d}', {
                    c: selectedLead.code,
                    d: relativeDate(selectedLead.created_at, lang) || dmy(selectedLead.created_at)
                  })}
                </span>
              </div>
              <button
                type="button"
                className="ib lp-x"
                onClick={() => {
                  setSelectedId(null);
                  setMobilePanelOpen(false);
                }}
                aria-label={t('Close')}
              >
                <Icon name="close" />
              </button>
            </div>

            <div className={`lp-next s-${stateOf(selectedLead)}`}>
              <Pill tone={getLeadPillTone(stateOf(selectedLead))}>
                {getLeadPillLabel(stateOf(selectedLead))}
              </Pill>
              <span>{formatNextCall(selectedLead)}</span>
              <span className="dots">
                {Array.from({ length: maxCalls }, (_, i) => (
                  <i key={i} className={i < selectedLead.call_attempts ? 'on' : ''} />
                ))}
              </span>
            </div>

            {/* Quick Contact Actions */}
            <div className="lp-cta">
              {selectedLead.phone ? (
                <a className="btn" href={`tel:${selectedLead.phone}`}>
                  <Icon name="phone" />
                  <span>{t('Call')}</span>
                </a>
              ) : (
                <span className="btn" aria-disabled="true">
                  <Icon name="phone" />
                  <span>{t('No phone')}</span>
                </span>
              )}

              {waUrl && (
                <a className="btn" href={waUrl} target="_blank" rel="noreferrer">
                  <Icon name="chat" />
                  <span>WhatsApp</span>
                </a>
              )}

              {tgUrl && (
                <a className="btn" href={tgUrl} target="_blank" rel="noreferrer">
                  <Icon name="send" />
                  <span>Telegram</span>
                </a>
              )}
            </div>

            {/* Log Call Section */}
            {selectedLead.status === 'open' && (
              <div className="lp-log">
                <h3>{t('Log call {n}', { n: selectedLead.call_attempts + 1 })}</h3>
                <input
                  className="inp"
                  placeholder={t('What happened? (optional)')}
                  value={logNote}
                  onChange={e => setLogNote(e.target.value)}
                />

                {logMode === null ? (
                  <div className="lp-btns">
                    <button
                      type="button"
                      className="btn ob-ok"
                      onClick={() => setLogMode('answered')}
                    >
                      <Icon name="check" />
                      <span>{t('Talked, call again')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleLogCall('no_answer')}
                    >
                      <Icon name="clock" />
                      <span>{t('No answer')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleLogCall('not_interested')}
                    >
                      <Icon name="close" />
                      <span>{t('Not interested')}</span>
                    </button>
                    <button
                      type="button"
                      className="btn"
                      onClick={() => handleLogCall('out_of_scope')}
                    >
                      <Icon name="flag" />
                      <span>{t('Out of scope')}</span>
                    </button>
                  </div>
                ) : (
                  <div className="lp-ans">
                    <label className="field">
                      <span className="field-lbl">{t('Next call on')}</span>
                      <DateInput
                        value={answeredNextDate}
                        min={today}
                        onChange={v => v && setAnsweredNextDate(v)}
                      />
                    </label>
                    <div className="row-btn">
                      <button
                        type="button"
                        className="btn"
                        onClick={() => setLogMode(null)}
                      >
                        {t('Cancel')}
                      </button>
                      <button
                        type="button"
                        className="btn btn-primary"
                        onClick={() => handleLogCall('answered')}
                      >
                        {t('Save call')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Enquiry Details */}
            <div className="lp-sec">
              <h3>{t('Enquiry')}</h3>
              <dl className="props ro">
                <div>
                  <dt>{t('Phone')}</dt>
                  <dd>{selectedLead.phone || <em className="nil">{t('Not given')}</em>}</dd>
                </div>
                {selectedLead.telegram && (
                  <div>
                    <dt>Telegram</dt>
                    <dd>{selectedLead.telegram}</dd>
                  </div>
                )}
                <div>
                  <dt>{t('Destination')}</dt>
                  <dd>{selectedLead.interest_country ? t(selectedLead.interest_country) : <em className="nil">{t('Not sure yet')}</em>}</dd>
                </div>
                <div>
                  <dt>{t('Package')}</dt>
                  <dd>{selectedLead.interest_package ? t(PACKAGE_LABEL[selectedLead.interest_package] || selectedLead.interest_package) : <em className="nil">{t('Not sure yet')}</em>}</dd>
                </div>
                <div>
                  <dt>{t('Intake')}</dt>
                  <dd>{selectedLead.intake || <em className="nil">{t('Not given')}</em>}</dd>
                </div>
                <div>
                  <dt>{t('Education')}</dt>
                  <dd>{selectedLead.education || <em className="nil">{t('Not given')}</em>}</dd>
                </div>
                <div>
                  <dt>{t('Goal')}</dt>
                  <dd>{selectedLead.goal || <em className="nil">{t('Not given')}</em>}</dd>
                </div>
                <div>
                  <dt>{t('Source')}</dt>
                  <dd>{selectedLead.source ? t(selectedLead.source) : <em className="nil">{t('Not given')}</em>}</dd>
                </div>
              </dl>
              {selectedLead.notes && <p className="lp-notes">{selectedLead.notes}</p>}
            </div>

            {/* Call History Timeline */}
            <div className="lp-sec">
              <h3>{t('Call history')}</h3>
              {(!selectedLead.calls || selectedLead.calls.length === 0) ? (
                <p className="muted small">{t('No calls logged yet.')}</p>
              ) : (
                <ul className="timeline">
                  {[...selectedLead.calls].reverse().map(c => (
                    <li key={c.id} className={`tl tl-${c.outcome}`}>
                      <span className="tl-dot" />
                      <div>
                        <p>
                          <b>{t('Call {n}', { n: c.attempt })}</b>: {t(LEAD_OUTCOMES[c.outcome] || c.outcome)}
                          {c.note ? `. ${c.note}` : ''}
                        </p>
                        <span className="tl-meta">
                          {c.author_name}, {ethLong(c.ts, lang, { short: true })}
                        </span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Footer Actions */}
            <div className="lp-foot">
              {selectedLead.status === 'converted' && selectedLead.converted_case_id ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => navigate(`/students/${selectedLead.converted_case_id}`)}
                >
                  <Icon name="users" />
                  <span>{t('Open case {id}', { id: selectedLead.converted_case_id })}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={() => handleConvert(selectedLead)}
                >
                  <Icon name="convert" />
                  <span>{t('Register as a case')}</span>
                </button>
              )}

              {selectedLead.status === 'closed' && (
                <button
                  type="button"
                  className="btn"
                  onClick={() => reopenLead(selectedLead.id)}
                >
                  <Icon name="refresh" />
                  <span>{t('Reopen')}</span>
                </button>
              )}

              {!confirmDelete ? (
                <button
                  type="button"
                  className="ib"
                  title={t('Delete lead')}
                  aria-label={t('Delete lead')}
                  onClick={() => setConfirmDelete(true)}
                >
                  <Icon name="trash" />
                </button>
              ) : (
                <span className="dz-c inline">
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t('Keep')}
                  </button>
                  <button
                    type="button"
                    className="btn sm danger"
                    onClick={() => {
                      deleteLead(selectedLead.id);
                      setSelectedId(null);
                      setMobilePanelOpen(false);
                    }}
                  >
                    {t('Delete lead')}
                  </button>
                </span>
              )}
            </div>
          </aside>
        ) : (
          filteredLeads.length > 0 && (
            <aside className="lp lp-empty">
              <span className="empty-ic"><Icon name="phone" /></span>
              <p>{t('Pick a lead to see their details and log a call.')}</p>
            </aside>
          )
        )}
      </div>

      {/* New Lead Modal */}
      {isNewLeadOpen && (
        <NewLeadModal
          onClose={() => {
            setIsNewLeadOpen(false);
            setSearchParams({});
          }}
          onCreated={newLead => {
            setIsNewLeadOpen(false);
            setSearchParams({});
            setSelectedId(newLead.id);
          }}
        />
      )}
    </div>
  );
}

function NewLeadModal({
  onClose,
  onCreated
}: {
  onClose: () => void;
  onCreated: (lead: Lead) => void;
}) {
  const { t } = useTranslation();
  const { createLead } = useData();

  const [formData, setFormData] = useState({
    name: '',
    phone: '',
    telegram: '',
    source: 'Walk-in',
    interest_country: '',
    interest_package: '' as any,
    education: '',
    intake: 'Sept 2026',
    goal: 'Master’s',
    notes: ''
  });
  const [error, setError] = useState('');

  const update = (key: string, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    setError('');
  };

  function handleSubmit(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (!formData.name.trim() && !formData.phone.trim()) {
      setError(t('Add a name or phone number.'));
      return;
    }
    const lead = createLead(formData);
    onCreated(lead);
  }

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div
        className="modal-box"
        onClick={e => e.stopPropagation()}
        style={{ maxWidth: 600, width: '92%' }}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">{t('New lead')}</h2>
            <p className="modal-sub">
              {t('A name or a phone number is enough to start.')}
            </p>
          </div>
          <button
            type="button"
            className="ib"
            onClick={onClose}
            aria-label={t('Close')}
          >
            <Icon name="close" />
          </button>
        </div>

        {error && (
          <div className="form-alert error">
            <Icon name="alert" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="modal-form">
          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Student name')}</span>
              <input
                className="input"
                value={formData.name}
                onChange={e => update('name', e.target.value)}
                placeholder={t('Full name')}
                autoFocus
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Phone')}</span>
              <input
                className="input"
                type="tel"
                value={formData.phone}
                onChange={e => update('phone', e.target.value)}
                placeholder="09…"
              />
            </label>

            <label className="field">
              <span className="field-lbl">Telegram</span>
              <input
                className="input"
                value={formData.telegram}
                onChange={e => update('telegram', e.target.value)}
                placeholder="@username"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Source')}</span>
              <select
                className="select"
                value={formData.source}
                onChange={e => update('source', e.target.value)}
              >
                {SOURCES.map(s => (
                  <option key={s} value={s}>{t(s)}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="field-sep" />

          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Study interest (country)')}</span>
              <ComboBox
                value={formData.interest_country}
                options={COUNTRY_NAMES}
                onChange={v => update('interest_country', v)}
                placeholder={t('Select country…')}
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Package')}</span>
              <select
                className="select"
                value={formData.interest_package}
                onChange={e => update('interest_package', e.target.value)}
              >
                <option value="">{t('Not sure yet')}</option>
                <option value="p1">{t('Package 1')}</option>
                <option value="p2">{t('Package 2')}</option>
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Education')}</span>
              <select
                className="select"
                value={formData.education}
                onChange={e => update('education', e.target.value)}
              >
                <option value="">{t('Select…')}</option>
                {EDUCATION_LEVELS.map(ed => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Intake')}</span>
              <select
                className="select"
                value={formData.intake}
                onChange={e => update('intake', e.target.value)}
              >
                {INTAKES.map(it => (
                  <option key={it} value={it}>{it}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Goal')}</span>
              <select
                className="select"
                value={formData.goal}
                onChange={e => update('goal', e.target.value)}
              >
                {GOALS.map(g => (
                  <option key={g} value={g}>{g}</option>
                ))}
              </select>
            </label>
          </div>

          <label className="field full">
            <span className="field-lbl">{t('Notes')}</span>
            <textarea
              className="textarea"
              rows={2}
              value={formData.notes}
              onChange={e => update('notes', e.target.value)}
              placeholder={t('Any initial details, preferred times to call…')}
            />
          </label>

          <div className="modal-actions">
            <button
              type="button"
              className="btn btn-outline"
              onClick={onClose}
            >
              {t('Cancel')}
            </button>
            <button
              type="submit"
              className="btn btn-primary"
            >
              <Icon name="check" />
              <span>{t('Add lead')}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
