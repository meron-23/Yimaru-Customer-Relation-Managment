import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { StatusPill, Pill } from '../components/Pill';
import { DateInput } from '../components/DateInput';
import { ComboBox } from '../components/ComboBox';
import { nextActionOf } from '../lib/next-action';
import {
  STAGES_LIST,
  STAGE_INDEX,
  FINANCIAL_ITEMS,
  VISA_PRESETS,
  INTERVIEW_STEPS
} from '../lib/sample-data';
import {
  COUNTRY_NAMES,
  EDUCATION_LEVELS,
  INTAKES,
  RISK_LEVELS,
  VISA_DECISIONS
} from '../lib/reference-data';
import { waLink } from '../lib/leads';
import { dmy, ethLong } from '../lib/ethiopian-calendar';
import type { Student, Stage, Application } from '../types';

const STAGE_TONES: { bg: string; fg: string; bar: string }[] = [
  { bg: '#FDE4D2', fg: '#8A4318', bar: '#F39A5B' }, // Registration: peach
  { bg: '#DCE8FC', fg: '#24508F', bar: '#6E9EEA' }, // Assessment: sky
  { bg: '#E8DDF8', fg: '#55339A', bar: '#A386E3' }, // Onboarding: lavender
  { bg: '#F8DAF0', fg: '#8E2A7C', bar: '#DB7FC6' }, // Admission: pink
  { bg: '#FFF0A8', fg: '#735300', bar: '#F5C518' }, // Visa file: yellow
  { bg: '#CDF5EA', fg: '#0D6650', bar: '#22D3A6' }, // Submitted: aqua
  { bg: '#DFF3CD', fg: '#3B6A18', bar: '#83C45A' }  // Outcome: green
];

const AFTER_VISA_TASKS = [
  'Flight planning',
  'Accommodation',
  'Travel checklist',
  'Airport guidance',
  'University registration',
  'Residence permit',
  'Arrival orientation',
  'Emergency contacts'
];

export default function StudentRecord() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'am' ? 'am' : 'en') as 'en' | 'am';

  const {
    activities,
    getStudent,
    updateStudent,
    moveStudentStage,
    recordPayment,
    reopenPayment,
    archiveStudent,
    restoreStudent,
    deleteStudent,
    addStudentActivity,
    addStudentApplication,
    updateStudentApplication,
    removeStudentApplication
  } = useData();

  const { users } = useAuth();
  const officerNames = Array.from(new Set(users.map(u => u.full_name)));

  const student = id ? getStudent(id) : undefined;

  const [activeTab, setActiveTab] = useState<'journey' | 'profile' | 'payments' | 'activity'>('journey');
  const [openStep, setOpenStep] = useState<Stage>('registration');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [newNoteText, setNewNoteText] = useState('');

  // Editable Profile Form State
  const [profileForm, setProfileForm] = useState<Partial<Student>>({});

  // Admission New Application State
  const [isAddingApp, setIsAddingApp] = useState(false);
  const [newApp, setNewApp] = useState<Partial<Application>>({
    university: '',
    program: '',
    portal: '',
    fee: undefined,
    deadline: '',
    status: 'Planned'
  });

  useEffect(() => {
    if (student) {
      setOpenStep(student.stage);
      setProfileForm(student);
      setConfirmDelete(false);
    }
  }, [student?.id, student?.stage]);

  if (!student) {
    return (
      <div className="pg">
        <div className="empty">
          <span className="empty-ic"><Icon name="users" /></span>
          <h3>{t('Student record not found')}</h3>
          <p>{t('This case may have been deleted or the link is incorrect.')}</p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => navigate('/students')}
          >
            <Icon name="back" />
            <span>{t('Back to students')}</span>
          </button>
        </div>
      </div>
    );
  }

  const currentStageIndex = STAGE_INDEX[student.stage] ?? 0;
  const prevStage = STAGES_LIST[currentStageIndex - 1];
  const nextStage = STAGES_LIST[currentStageIndex + 1];

  const regPayment = student.payments?.find(p => p.kind === 'registration');
  const regFeePaid = !!regPayment?.paid;
  const isMoveBlocked = !regFeePaid && student.stage === 'registration';

  const na = nextActionOf(student);
  const country = student.strategy_country || student.target_countries?.[0];
  const waUrl = waLink(student.phone);

  const studentActivities = activities
    .filter(a => a.student_id === student.id)
    .sort((a, b) => b.ts.localeCompare(a.ts));

  // Visa Preset Checklist
  const countryVisaList = VISA_PRESETS[student.visa_country || country || ''] || VISA_PRESETS.Default;

  function handleSaveProfile(e: React.FormEvent) {
    e.preventDefault();
    updateStudent(student!.id, profileForm);
    addStudentActivity(student!.id, 'Profile updated', 'note');
  }

  function handleAddNote(e: React.FormEvent) {
    e.preventDefault();
    if (!newNoteText.trim()) return;
    addStudentActivity(student!.id, newNoteText.trim(), 'note');
    setNewNoteText('');
  }

  function handleCreateApp(e: React.FormEvent) {
    e.preventDefault();
    if (!newApp.university?.trim()) return;
    addStudentApplication(student!.id, newApp);
    setIsAddingApp(false);
    setNewApp({
      university: '',
      program: '',
      portal: '',
      fee: undefined,
      deadline: '',
      status: 'Planned'
    });
  }

  function toggleVisaDoc(item: string) {
    const nextVisa = { ...(student!.visa || {}), [item]: !student!.visa?.[item] };
    updateStudent(student!.id, { visa: nextVisa });
  }

  function toggleFinancialItem(item: string) {
    const nextFin = { ...(student!.financial || {}), [item]: !student!.financial?.[item] };
    updateStudent(student!.id, { financial: nextFin });
  }

  function toggleInterviewStep(key: string) {
    const nextIv = { ...(student!.interview || {}), [key]: !student!.interview?.[key] };
    updateStudent(student!.id, { interview: nextIv });
  }

  function toggleAfterVisaTask(task: string) {
    const key = `pv_${task}`;
    const nextIv = { ...(student!.interview || {}), [key]: !student!.interview?.[key] };
    updateStudent(student!.id, { interview: nextIv });
  }

  // Count documents
  const completedVisaDocs = countryVisaList.filter(d => student.visa?.[d]).length;
  const completedFinItems = FINANCIAL_ITEMS.filter(f => student.financial?.[f]).length;

  return (
    <div className="pg rec">
      {/* Breadcrumb */}
      <div className="crumb">
        <button type="button" onClick={() => navigate('/students')}>
          <Icon name="back" />
          <span>{t('Students')}</span>
        </button>
        <Icon name="right" />
        <span>{student.full_name || student.case_id}</span>
      </div>

      {/* Record Header Card */}
      <header className="rec-h">
        <div className="rec-top">
          <Avatar name={student.full_name} size={56} />
          <div className="rec-t">
            <h1>{student.full_name || t('Unnamed student')}</h1>
            <div className="rec-meta">
              <span className="rec-id">{student.case_id}</span>
              <StatusPill student={student} />
              {student.archived && <Pill tone="grey">{t('Archived')}</Pill>}
              {country && (
                <span className="rec-ct">
                  <Icon name="globe" />
                  <span>{t(country)}</span>
                </span>
              )}
            </div>
          </div>

          <div className="rec-a">
            {student.phone && (
              <a className="btn ic-only" href={`tel:${student.phone}`} aria-label={t('Call')}>
                <Icon name="phone" />
              </a>
            )}
            {waUrl && (
              <a className="btn ic-only" href={waUrl} target="_blank" rel="noreferrer" aria-label="WhatsApp">
                <Icon name="chat" />
              </a>
            )}
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (student.archived) restoreStudent(student.id);
                else archiveStudent(student.id);
              }}
            >
              <Icon name="archive" />
              <span>{t(student.archived ? 'Restore' : 'Archive')}</span>
            </button>

            {nextStage && (
              <button
                type="button"
                className="btn btn-primary"
                disabled={isMoveBlocked}
                title={isMoveBlocked ? t('Record the registration fee to move on.') : ''}
                onClick={() => moveStudentStage(student.id, nextStage.key)}
              >
                {isMoveBlocked && <Icon name="lock" />}
                <span>{t('Move to {s}', { s: t(nextStage.label) })}</span>
                <Icon name="right" />
              </button>
            )}
          </div>
        </div>

        {/* Next Action Yellow Banner */}
        <div className={`na-m na-${na.tone}`}>
          <Icon name={na.tone === 'ok' ? 'check' : na.tone === 'bad' ? 'alert' : 'flag'} />
          <span>
            <b>{t('Next action')}</b>: {t(na.long)}
          </span>
        </div>

        {/* 7-Segment Progress Bar */}
        <div className="rec-prog">
          <div className="rp-steps">
            {STAGES_LIST.map((s, idx) => {
              const isPast = idx < currentStageIndex;
              const isCurrent = idx === currentStageIndex;
              const isBlocked = isCurrent && isMoveBlocked;

              let stateCls = '';
              if (isPast) stateCls = 'd';
              else if (isBlocked) stateCls = 'b';
              else if (isCurrent) {
                stateCls = student.decision === 'approved' ? 'ok' : student.decision === 'refused' ? 'no' : 'c';
              }

              return (
                <button
                  key={s.key}
                  type="button"
                  className={`rps ${stateCls}`}
                  style={{ '--c': STAGE_TONES[idx].bar } as React.CSSProperties}
                  onClick={() => {
                    setActiveTab('journey');
                    setOpenStep(s.key);
                    try {
                      document.getElementById(`step-${s.key}`)?.scrollIntoView({ behavior: 'smooth' });
                    } catch {}
                  }}
                  title={t(s.hint)}
                >
                  <i />
                  <span>{t(s.label)}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Tab Switcher */}
        <div className="rec-tabs">
          <button
            type="button"
            className={`rec-tab ${activeTab === 'journey' ? 'on' : ''}`}
            onClick={() => setActiveTab('journey')}
          >
            <span>{t('Journey')}</span>
          </button>
          <button
            type="button"
            className={`rec-tab ${activeTab === 'profile' ? 'on' : ''}`}
            onClick={() => setActiveTab('profile')}
          >
            <span>{t('Profile')}</span>
          </button>
          <button
            type="button"
            className={`rec-tab ${activeTab === 'payments' ? 'on' : ''}`}
            onClick={() => setActiveTab('payments')}
          >
            <span>{t('Payments')}</span>
            <em className="tab-cnt">
              {(student.payments || []).filter(p => p.paid).length}/
              {student.package_type === 'p1' ? 2 : 3}
            </em>
          </button>
          <button
            type="button"
            className={`rec-tab ${activeTab === 'activity' ? 'on' : ''}`}
            onClick={() => setActiveTab('activity')}
          >
            <span>{t('Activity')}</span>
            <em className="tab-cnt">{studentActivities.length}</em>
          </button>
        </div>
      </header>

      {/* Main Two-Column Layout */}
      <div className="rec-layout">
        <div className="rec-main">
          {/* TAB 1: JOURNEY */}
          {activeTab === 'journey' && (
            <div className="journey-flow">
              {STAGES_LIST.map((step, idx) => {
                const isCurrent = step.key === student.stage;
                const isPast = idx < currentStageIndex;
                const isOpen = openStep === step.key;
                const tone = STAGE_TONES[idx];

                return (
                  <section
                    key={step.key}
                    id={`step-${step.key}`}
                    className={`step-card ${isCurrent ? 'current' : isPast ? 'done' : 'future'} ${isOpen ? 'open' : ''}`}
                    style={{ '--step-bar': tone.bar } as React.CSSProperties}
                  >
                    <header
                      className="step-card-h"
                      onClick={() => setOpenStep(isOpen ? '' as any : step.key)}
                    >
                      <div className="step-badge-num">{idx + 1}</div>
                      <div className="step-info">
                        <h3>{t(step.label)}</h3>
                        <p>{t(step.hint)}</p>
                      </div>
                      <div className="step-status-tag">
                        <span className={`pill pl-${isPast ? 'green' : isCurrent ? 'teal' : 'grey'}`}>
                          {t(isPast ? 'Done' : isCurrent ? 'Current' : 'Not started')}
                        </span>
                        <Icon name={isOpen ? 'up' : 'down'} size={18} />
                      </div>
                    </header>

                    {isOpen && (
                      <div className="step-card-body">
                        {/* STEP 1: REGISTRATION */}
                        {step.key === 'registration' && (
                          <div className="step-block">
                            <h4>{t('Package')}</h4>
                            <div className="pkg-cards">
                              <button
                                type="button"
                                className={`pkg-card ${student.package_type === 'p1' ? 'sel' : ''}`}
                                onClick={() => updateStudent(student.id, { package_type: 'p1' })}
                              >
                                <b>{t('Package 1')}</b>
                                <span>{t('Consulting, applying & university admission')}</span>
                                <small>{t('Registration fee + Payment 1')}</small>
                              </button>
                              <button
                                type="button"
                                className={`pkg-card ${student.package_type === 'p2' ? 'sel' : ''}`}
                                onClick={() => updateStudent(student.id, { package_type: 'p2' })}
                              >
                                <b>{t('Package 2')}</b>
                                <span>{t('Full journey through visa completion')}</span>
                                <small>{t('Registration fee + Payment 1 + Payment 2')}</small>
                              </button>
                            </div>

                            <div className="fee-row">
                              <label className="fee-check">
                                <input
                                  type="checkbox"
                                  checked={regFeePaid}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      recordPayment(student.id, 'registration', regPayment?.amount || 10000);
                                    } else {
                                      reopenPayment(student.id, 'registration');
                                    }
                                  }}
                                />
                                <span><b>{t('Registration fee')}</b> ({regPayment?.amount || 10000} ETB)</span>
                              </label>
                              <span className="fee-date">
                                {regFeePaid ? `${t('Paid on')} ${dmy(regPayment?.paid_on)}` : t('Unpaid')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* STEP 2: ASSESSMENT */}
                        {step.key === 'assessment' && (
                          <div className="step-block">
                            <div className="profile-glance">
                              <h4>{t('Profile at a glance')}</h4>
                              <div className="glance-grid">
                                <div><span>{t('Education')}:</span> <b>{student.education || '—'}</b></div>
                                <div><span>{t('GPA')}:</span> <b>{student.gpa || '—'}</b></div>
                                <div><span>{t('English')}:</span> <b>{student.english_proficiency || '—'}</b></div>
                                <div><span>{t('Budget')}:</span> <b>{student.budget || '—'}</b></div>
                                <div><span>{t('Sponsor')}:</span> <b>{student.sponsor || '—'}</b></div>
                                <div><span>{t('Refusals')}:</span> <b>{student.previous_refusals || '—'}</b></div>
                              </div>
                            </div>

                            <h4>{t('Risk level')}</h4>
                            <p className="hint-text">{t('An honest read of the profile, not a promise to the student.')}</p>
                            <div className="risk-buttons">
                              {RISK_LEVELS.map(r => (
                                <button
                                  key={r.key}
                                  type="button"
                                  className={`btn ${student.risk === r.key ? `btn-${r.tone} on` : 'btn-outline'}`}
                                  onClick={() => updateStudent(student.id, { risk: r.key as any })}
                                >
                                  {t(r.label)}
                                </button>
                              ))}
                            </div>

                            <label className="field full" style={{ marginTop: 16 }}>
                              <span className="field-lbl">{t('Assessment notes')}</span>
                              <textarea
                                className="textarea"
                                rows={3}
                                value={student.assessment_notes || ''}
                                onChange={e => updateStudent(student.id, { assessment_notes: e.target.value })}
                                placeholder={t('Strengths, paper trail gaps, recommendations…')}
                              />
                            </label>
                          </div>
                        )}

                        {/* STEP 3: ONBOARDING */}
                        {step.key === 'onboarding' && (
                          <div className="step-block">
                            <h4>{t('Study plan & contract')}</h4>
                            <div className="grid2">
                              <label className="field">
                                <span className="field-lbl">{t('Destination country')}</span>
                                <ComboBox
                                  value={student.strategy_country || ''}
                                  options={COUNTRY_NAMES}
                                  onChange={v => updateStudent(student.id, { strategy_country: v })}
                                  placeholder={t('Select country…')}
                                />
                              </label>

                              <label className="field">
                                <span className="field-lbl">{t('University')}</span>
                                <input
                                  className="input"
                                  value={student.strategy_university || ''}
                                  onChange={e => updateStudent(student.id, { strategy_university: e.target.value })}
                                  placeholder="e.g. University of Bologna"
                                />
                              </label>

                              <label className="field">
                                <span className="field-lbl">{t('Program')}</span>
                                <input
                                  className="input"
                                  value={student.strategy_program || ''}
                                  onChange={e => updateStudent(student.id, { strategy_program: e.target.value })}
                                  placeholder="e.g. MSc Data Science"
                                />
                              </label>

                              <label className="field">
                                <span className="field-lbl">{t('Admission route')}</span>
                                <input
                                  className="input"
                                  value={student.strategy_admission_route || ''}
                                  onChange={e => updateStudent(student.id, { strategy_admission_route: e.target.value })}
                                  placeholder="e.g. Direct application / Universitaly"
                                />
                              </label>

                              <label className="field">
                                <span className="field-lbl">{t('Funding')}</span>
                                <select
                                  className="select"
                                  value={student.strategy_funding || ''}
                                  onChange={e => updateStudent(student.id, { strategy_funding: e.target.value })}
                                >
                                  <option value="Self-funded">{t('Self-sponsored')}</option>
                                  <option value="Scholarship">{t('Scholarship')}</option>
                                </select>
                              </label>

                              <label className="field">
                                <span className="field-lbl">{t('Visa route')}</span>
                                <input
                                  className="input"
                                  value={student.strategy_visa_route || ''}
                                  onChange={e => updateStudent(student.id, { strategy_visa_route: e.target.value })}
                                  placeholder="e.g. National D-Visa"
                                />
                              </label>
                            </div>
                          </div>
                        )}

                        {/* STEP 4: ADMISSION */}
                        {step.key === 'admission' && (
                          <div className="step-block">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                              <h4>{t('University applications')}</h4>
                              <button
                                type="button"
                                className="btn sm btn-primary"
                                onClick={() => setIsAddingApp(v => !v)}
                              >
                                <Icon name="plus" />
                                <span>{t('Add application')}</span>
                              </button>
                            </div>

                            {isAddingApp && (
                              <form onSubmit={handleCreateApp} className="app-add-box">
                                <div className="grid2">
                                  <label className="field">
                                    <span className="field-lbl">{t('University')} *</span>
                                    <input
                                      className="input"
                                      value={newApp.university}
                                      onChange={e => setNewApp(prev => ({ ...prev, university: e.target.value }))}
                                      placeholder="University name"
                                      autoFocus
                                    />
                                  </label>

                                  <label className="field">
                                    <span className="field-lbl">{t('Program')}</span>
                                    <input
                                      className="input"
                                      value={newApp.program}
                                      onChange={e => setNewApp(prev => ({ ...prev, program: e.target.value }))}
                                      placeholder="Program name"
                                    />
                                  </label>

                                  <label className="field">
                                    <span className="field-lbl">{t('Status')}</span>
                                    <select
                                      className="select"
                                      value={newApp.status}
                                      onChange={e => setNewApp(prev => ({ ...prev, status: e.target.value as any }))}
                                    >
                                      <option value="Planned">{t('Planned')}</option>
                                      <option value="Applied">{t('Applied')}</option>
                                      <option value="In review">{t('In review')}</option>
                                      <option value="Offer">{t('Offer')}</option>
                                      <option value="Rejected">{t('Rejected')}</option>
                                      <option value="Enrolled">{t('Enrolled')}</option>
                                    </select>
                                  </label>

                                  <label className="field">
                                    <span className="field-lbl">{t('Application deadline')}</span>
                                    <DateInput
                                      value={newApp.deadline}
                                      onChange={d => setNewApp(prev => ({ ...prev, deadline: d }))}
                                    />
                                  </label>
                                </div>
                                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 12 }}>
                                  <button
                                    type="button"
                                    className="btn sm"
                                    onClick={() => setIsAddingApp(false)}
                                  >
                                    {t('Cancel')}
                                  </button>
                                  <button
                                    type="submit"
                                    className="btn sm btn-primary"
                                  >
                                    {t('Save application')}
                                  </button>
                                </div>
                              </form>
                            )}

                            {(!student.applications || student.applications.length === 0) ? (
                              <p className="muted small">{t('No applications added yet.')}</p>
                            ) : (
                              <div className="apps-list">
                                {student.applications.map(app => (
                                  <div key={app.id} className="app-row">
                                    <div className="app-main">
                                      <b>{app.university}</b>
                                      <span>{app.program}</span>
                                      {app.deadline && (
                                        <small>{t('Deadline')}: {dmy(app.deadline)}</small>
                                      )}
                                    </div>
                                    <select
                                      className="select sm"
                                      value={app.status}
                                      onChange={e =>
                                        updateStudentApplication(student.id, app.id, { status: e.target.value as any })
                                      }
                                    >
                                      <option value="Planned">{t('Planned')}</option>
                                      <option value="Applied">{t('Applied')}</option>
                                      <option value="In review">{t('In review')}</option>
                                      <option value="Offer">{t('Offer')}</option>
                                      <option value="Rejected">{t('Rejected')}</option>
                                      <option value="Enrolled">{t('Enrolled')}</option>
                                    </select>
                                    <button
                                      type="button"
                                      className="ib"
                                      onClick={() => removeStudentApplication(student.id, app.id)}
                                      title={t('Remove')}
                                      aria-label={t('Remove')}
                                    >
                                      <Icon name="close" size={16} />
                                    </button>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Payment 1 Milestone row */}
                            <div className="fee-row" style={{ marginTop: 20 }}>
                              <label className="fee-check">
                                <input
                                  type="checkbox"
                                  checked={!!student.payments?.find(p => p.kind === 'payment1')?.paid}
                                  onChange={e => {
                                    if (e.target.checked) {
                                      recordPayment(student.id, 'payment1', 150000);
                                    } else {
                                      reopenPayment(student.id, 'payment1');
                                    }
                                  }}
                                />
                                <span><b>{t('Payment 1')}</b> ({t('Due on admission offer')} — 150,000 ETB)</span>
                              </label>
                              <span className="fee-date">
                                {student.payments?.find(p => p.kind === 'payment1')?.paid
                                  ? `${t('Paid on')} ${dmy(student.payments?.find(p => p.kind === 'payment1')?.paid_on)}`
                                  : t('Unpaid')}
                              </span>
                            </div>
                          </div>
                        )}

                        {/* STEP 5: VISA FILE */}
                        {step.key === 'visafile' && (
                          <div className="step-block">
                            <h4>{t('Financial checklist')} ({completedFinItems}/{FINANCIAL_ITEMS.length})</h4>
                            <div className="checklist-grid">
                              {FINANCIAL_ITEMS.map(item => (
                                <label key={item} className="chk-label">
                                  <input
                                    type="checkbox"
                                    checked={!!student.financial?.[item]}
                                    onChange={() => toggleFinancialItem(item)}
                                  />
                                  <span>{t(item)}</span>
                                </label>
                              ))}
                            </div>

                            <label className="field full" style={{ marginTop: 12 }}>
                              <span className="field-lbl">{t('Financial story and notes')}</span>
                              <textarea
                                className="textarea"
                                rows={2}
                                value={student.financial_notes || ''}
                                onChange={e => updateStudent(student.id, { financial_notes: e.target.value })}
                                placeholder={t('Sponsor income, consistency across bank statements…')}
                              />
                            </label>

                            <h4 style={{ marginTop: 24 }}>
                              {t('Country visa checklist')} ({completedVisaDocs}/{countryVisaList.length})
                            </h4>
                            <div className="checklist-grid">
                              {countryVisaList.map(doc => (
                                <label key={doc} className="chk-label">
                                  <input
                                    type="checkbox"
                                    checked={!!student.visa?.[doc]}
                                    onChange={() => toggleVisaDoc(doc)}
                                  />
                                  <span>{t(doc)}</span>
                                </label>
                              ))}
                            </div>

                            <div className="qc-box" style={{ marginTop: 20 }}>
                              <h4>{t('Quality check sign-off')}</h4>
                              <p className="hint-text">{t('A second officer reviews the complete file before appointment lodging.')}</p>
                              <label className="field full">
                                <span className="field-lbl">{t('QC notes')}</span>
                                <input
                                  className="input"
                                  value={student.qc_notes || ''}
                                  onChange={e => updateStudent(student.id, { qc_notes: e.target.value })}
                                  placeholder={t('Checked by second officer, stamps verified…')}
                                />
                              </label>
                              <div style={{ marginTop: 12 }}>
                                <button
                                  type="button"
                                  className={`btn ${student.qc_passed ? 'btn-green' : 'btn-primary'}`}
                                  onClick={() => updateStudent(student.id, { qc_passed: !student.qc_passed })}
                                >
                                  <Icon name={student.qc_passed ? 'check' : 'flag'} />
                                  <span>{t(student.qc_passed ? 'File signed off (QC passed)' : 'Sign off file as ready')}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        )}

                        {/* STEP 6: SUBMITTED */}
                        {step.key === 'submitted' && (
                          <div className="step-block">
                            <h4>{t('Appointment and lodging')}</h4>
                            <div className="checklist-grid">
                              <label className="chk-label">
                                <input
                                  type="checkbox"
                                  checked={student.appt_requested}
                                  onChange={e => updateStudent(student.id, { appt_requested: e.target.checked })}
                                />
                                <span>{t('Appointment requested')}</span>
                              </label>
                              <label className="chk-label">
                                <input
                                  type="checkbox"
                                  checked={student.appt_confirmed}
                                  onChange={e => updateStudent(student.id, { appt_confirmed: e.target.checked })}
                                />
                                <span>{t('Appointment confirmed')}</span>
                              </label>
                              <label className="chk-label">
                                <input
                                  type="checkbox"
                                  checked={student.appt_biometrics}
                                  onChange={e => updateStudent(student.id, { appt_biometrics: e.target.checked })}
                                />
                                <span>{t('Biometrics done')}</span>
                              </label>
                              <label className="chk-label">
                                <input
                                  type="checkbox"
                                  checked={student.appt_submitted}
                                  onChange={e => updateStudent(student.id, { appt_submitted: e.target.checked })}
                                />
                                <span>{t('File lodged with embassy')}</span>
                              </label>
                            </div>

                            <label className="field" style={{ marginTop: 12, maxWidth: 280 }}>
                              <span className="field-lbl">{t('Appointment date')}</span>
                              <DateInput
                                value={student.appt_date}
                                onChange={d => updateStudent(student.id, { appt_date: d })}
                              />
                            </label>

                            <h4 style={{ marginTop: 24 }}>{t('Interview preparation')}</h4>
                            <div className="checklist-grid">
                              {INTERVIEW_STEPS.map(([k, label]) => (
                                <label key={k} className="chk-label">
                                  <input
                                    type="checkbox"
                                    checked={!!student.interview?.[k]}
                                    onChange={() => toggleInterviewStep(k)}
                                  />
                                  <span>{t(label)}</span>
                                </label>
                              ))}
                            </div>
                          </div>
                        )}

                        {/* STEP 7: OUTCOME */}
                        {step.key === 'outcome' && (
                          <div className="step-block">
                            <h4>{t('Visa decision')}</h4>
                            <div className="decision-buttons">
                              {VISA_DECISIONS.map(d => (
                                <button
                                  key={d.key}
                                  type="button"
                                  className={`btn ${student.decision === d.key ? `btn-${d.tone} on` : 'btn-outline'}`}
                                  onClick={() =>
                                    updateStudent(student.id, {
                                      decision: d.key as any,
                                      decided_at: new Date().toISOString()
                                    })
                                  }
                                >
                                  {t(d.label)}
                                </button>
                              ))}
                            </div>

                            {student.decision === 'approved' && (
                              <>
                                <h4 style={{ marginTop: 24 }}>{t('After the visa')}</h4>
                                <div className="checklist-grid">
                                  {AFTER_VISA_TASKS.map(task => (
                                    <label key={task} className="chk-label">
                                      <input
                                        type="checkbox"
                                        checked={!!student.interview?.[`pv_${task}`]}
                                        onChange={() => toggleAfterVisaTask(task)}
                                      />
                                      <span>{t(task)}</span>
                                    </label>
                                  ))}
                                </div>

                                {student.package_type === 'p2' && (
                                  <div className="fee-row" style={{ marginTop: 20 }}>
                                    <label className="fee-check">
                                      <input
                                        type="checkbox"
                                        checked={!!student.payments?.find(p => p.kind === 'payment2')?.paid}
                                        onChange={e => {
                                          if (e.target.checked) {
                                            recordPayment(student.id, 'payment2', 150000);
                                          } else {
                                            reopenPayment(student.id, 'payment2');
                                          }
                                        }}
                                      />
                                      <span><b>{t('Payment 2')}</b> ({t('Due once visa approved')} — 150,000 ETB)</span>
                                    </label>
                                    <span className="fee-date">
                                      {student.payments?.find(p => p.kind === 'payment2')?.paid
                                        ? `${t('Paid on')} ${dmy(student.payments?.find(p => p.kind === 'payment2')?.paid_on)}`
                                        : t('Unpaid')}
                                    </span>
                                  </div>
                                )}
                              </>
                            )}
                          </div>
                        )}

                        {/* Step Card Footer Controls */}
                        <div className="step-card-f">
                          {prevStage && (
                            <button
                              type="button"
                              className="btn sm"
                              onClick={() => moveStudentStage(student.id, prevStage.key)}
                            >
                              <Icon name="back" />
                              <span>{t('Back to {s}', { s: t(prevStage.label) })}</span>
                            </button>
                          )}

                          {nextStage ? (
                            <button
                              type="button"
                              className="btn sm btn-primary"
                              disabled={isMoveBlocked}
                              onClick={() => moveStudentStage(student.id, nextStage.key)}
                            >
                              {isMoveBlocked && <Icon name="lock" />}
                              <span>{t('Done, move to {next}', { next: t(nextStage.label) })}</span>
                              <Icon name="right" />
                            </button>
                          ) : (
                            <span className="muted small">{t('This is the final step.')}</span>
                          )}
                        </div>
                      </div>
                    )}
                  </section>
                );
              })}
            </div>
          )}

          {/* TAB 2: PROFILE */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="form-wrap">
              <section className="fsec">
                <div className="fsec-h">
                  <h2>{t('Contact')}</h2>
                </div>
                <div className="grid2">
                  <label className="field">
                    <span className="field-lbl">{t('Full name')}</span>
                    <input
                      className="input"
                      value={profileForm.full_name || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, full_name: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('Phone')}</span>
                    <input
                      className="input"
                      value={profileForm.phone || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, phone: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('Email')}</span>
                    <input
                      className="input"
                      value={profileForm.email || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="fsec">
                <div className="fsec-h">
                  <h2>{t('Academic background')}</h2>
                </div>
                <div className="grid2">
                  <label className="field">
                    <span className="field-lbl">{t('Education')}</span>
                    <select
                      className="select"
                      value={profileForm.education || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, education: e.target.value }))}
                    >
                      {EDUCATION_LEVELS.map(ed => (
                        <option key={ed} value={ed}>{ed}</option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('GPA')}</span>
                    <input
                      className="input"
                      value={profileForm.gpa || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, gpa: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('Field of study')}</span>
                    <input
                      className="input"
                      value={profileForm.field_of_study || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, field_of_study: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('English proficiency')}</span>
                    <input
                      className="input"
                      value={profileForm.english_proficiency || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, english_proficiency: e.target.value }))}
                    />
                  </label>
                </div>
              </section>

              <section className="fsec">
                <div className="fsec-h">
                  <h2>{t('Study plan')}</h2>
                </div>
                <div className="grid2">
                  <label className="field">
                    <span className="field-lbl">{t('Destination country')}</span>
                    <ComboBox
                      value={profileForm.strategy_country || ''}
                      options={COUNTRY_NAMES}
                      onChange={v => setProfileForm(prev => ({ ...prev, strategy_country: v }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('University')}</span>
                    <input
                      className="input"
                      value={profileForm.strategy_university || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, strategy_university: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('Program')}</span>
                    <input
                      className="input"
                      value={profileForm.strategy_program || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, strategy_program: e.target.value }))}
                    />
                  </label>
                  <label className="field">
                    <span className="field-lbl">{t('Intake')}</span>
                    <select
                      className="select"
                      value={profileForm.intended_intake || ''}
                      onChange={e => setProfileForm(prev => ({ ...prev, intended_intake: e.target.value }))}
                    >
                      {INTAKES.map(it => (
                        <option key={it} value={it}>{it}</option>
                      ))}
                    </select>
                  </label>
                </div>
              </section>

              <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
                <button type="submit" className="btn btn-primary">
                  <Icon name="check" />
                  <span>{t('Save changes')}</span>
                </button>
              </div>
            </form>
          )}

          {/* TAB 3: PAYMENTS */}
          {activeTab === 'payments' && (
            <div className="payments-tab">
              <h3>{t('Payments overview')}</h3>
              <p className="hint-text">{t('Recorded payments gate milestone work.')}</p>

              <div className="pay-table">
                <div className="pay-row">
                  <div>
                    <b>{t('Registration fee')}</b>
                    <small>{t('Non-refundable — starts the whole process')}</small>
                  </div>
                  <b>{regPayment?.amount || 10000} ETB</b>
                  <span>
                    {regFeePaid ? (
                      <span className="pill pl-green">{t('Paid on')} {dmy(regPayment?.paid_on)}</span>
                    ) : (
                      <span className="pill pl-magenta">{t('Unpaid')}</span>
                    )}
                  </span>
                  <div>
                    {regFeePaid ? (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => reopenPayment(student.id, 'registration')}
                      >
                        {t('Reopen')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn sm btn-primary"
                        onClick={() => recordPayment(student.id, 'registration', regPayment?.amount || 10000)}
                      >
                        {t('Mark paid')}
                      </button>
                    )}
                  </div>
                </div>

                <div className="pay-row">
                  <div>
                    <b>{t('Payment 1')}</b>
                    <small>{t('Due once university admission offer is received')}</small>
                  </div>
                  <b>150,000 ETB</b>
                  <span>
                    {student.payments?.find(p => p.kind === 'payment1')?.paid ? (
                      <span className="pill pl-green">{t('Paid on')} {dmy(student.payments?.find(p => p.kind === 'payment1')?.paid_on)}</span>
                    ) : (
                      <span className="pill pl-grey">{t('Unpaid')}</span>
                    )}
                  </span>
                  <div>
                    {student.payments?.find(p => p.kind === 'payment1')?.paid ? (
                      <button
                        type="button"
                        className="btn sm"
                        onClick={() => reopenPayment(student.id, 'payment1')}
                      >
                        {t('Reopen')}
                      </button>
                    ) : (
                      <button
                        type="button"
                        className="btn sm btn-primary"
                        onClick={() => recordPayment(student.id, 'payment1', 150000)}
                      >
                        {t('Mark paid')}
                      </button>
                    )}
                  </div>
                </div>

                {student.package_type === 'p2' && (
                  <div className="pay-row">
                    <div>
                      <b>{t('Payment 2')}</b>
                      <small>{t('Due once visa is approved')}</small>
                    </div>
                    <b>150,000 ETB</b>
                    <span>
                      {student.payments?.find(p => p.kind === 'payment2')?.paid ? (
                        <span className="pill pl-green">{t('Paid on')} {dmy(student.payments?.find(p => p.kind === 'payment2')?.paid_on)}</span>
                      ) : (
                        <span className="pill pl-grey">{t('Unpaid')}</span>
                      )}
                    </span>
                    <div>
                      {student.payments?.find(p => p.kind === 'payment2')?.paid ? (
                        <button
                          type="button"
                          className="btn sm"
                          onClick={() => reopenPayment(student.id, 'payment2')}
                        >
                          {t('Reopen')}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="btn sm btn-primary"
                          onClick={() => recordPayment(student.id, 'payment2', 150000)}
                        >
                          {t('Mark paid')}
                        </button>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 4: ACTIVITY */}
          {activeTab === 'activity' && (
            <div className="activity-tab">
              <form onSubmit={handleAddNote} className="act-add-box">
                <textarea
                  className="textarea"
                  rows={2}
                  value={newNoteText}
                  onChange={e => setNewNoteText(e.target.value)}
                  placeholder={t('Add a note: a call, a document received, a decision…')}
                />
                <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 8 }}>
                  <button type="submit" className="btn btn-primary sm">
                    <Icon name="note" />
                    <span>{t('Add note')}</span>
                  </button>
                </div>
              </form>

              <div className="timeline-wrap" style={{ marginTop: 24 }}>
                {studentActivities.length === 0 ? (
                  <p className="muted small">{t('No activity logged yet.')}</p>
                ) : (
                  <ul className="timeline">
                    {studentActivities.map(act => (
                      <li key={act.id} className={`tl tl-${act.kind}`}>
                        <span className="tl-dot" />
                        <div>
                          <p><b>{t(act.text)}</b></p>
                          <span className="tl-meta">
                            {act.author_name}, {ethLong(act.ts, lang, { weekday: false })}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Desktop Side Cards (Right Column) */}
        <aside className="rec-side">
          <div className="card scard-box">
            <h4>{t('Details')}</h4>
            <div className="meta-list">
              <label className="meta-item">
                <span>{t('Destination')}</span>
                <ComboBox
                  value={student.strategy_country || ''}
                  options={COUNTRY_NAMES}
                  onChange={v => updateStudent(student.id, { strategy_country: v })}
                />
              </label>

              <label className="meta-item">
                <span>{t('Package')}</span>
                <select
                  className="select sm"
                  value={student.package_type || ''}
                  onChange={e => updateStudent(student.id, { package_type: e.target.value as any })}
                >
                  <option value="">{t('Not chosen')}</option>
                  <option value="p1">{t('Package 1')}</option>
                  <option value="p2">{t('Package 2')}</option>
                </select>
              </label>

              <label className="meta-item">
                <span>{t('Funding')}</span>
                <select
                  className="select sm"
                  value={student.sponsor_type || ''}
                  onChange={e => updateStudent(student.id, { sponsor_type: e.target.value as any })}
                >
                  <option value="self">{t('Self-sponsored')}</option>
                  <option value="scholarship">{t('Scholarship')}</option>
                </select>
              </label>

              <label className="meta-item">
                <span>{t('Officer')}</span>
                <select
                  className="select sm"
                  value={student.officer || ''}
                  onChange={e => updateStudent(student.id, { officer: e.target.value })}
                >
                  <option value="">{t('Unassigned')}</option>
                  {officerNames.map(name => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
              </label>

              <label className="meta-item">
                <span>{t('Risk')}</span>
                <select
                  className="select sm"
                  value={student.risk || ''}
                  onChange={e => updateStudent(student.id, { risk: e.target.value as any })}
                >
                  <option value="">{t('Not set')}</option>
                  <option value="strong">{t('Strong')}</option>
                  <option value="improve">{t('Needs improvement')}</option>
                  <option value="high">{t('High risk')}</option>
                </select>
              </label>
            </div>
          </div>

          <div className="card scard-box">
            <h4>{t('Contact')}</h4>
            <div className="contact-list">
              {student.phone ? (
                <div>
                  <small>{t('Phone')}:</small>
                  <a href={`tel:${student.phone}`}>{student.phone}</a>
                </div>
              ) : (
                <div><small>{t('Phone')}:</small> <em>{t('Not given')}</em></div>
              )}

              {student.email ? (
                <div>
                  <small>{t('Email')}:</small>
                  <a href={`mailto:${student.email}`}>{student.email}</a>
                </div>
              ) : null}

              {waUrl && (
                <div style={{ marginTop: 8 }}>
                  <a className="btn sm" href={waUrl} target="_blank" rel="noreferrer">
                    <Icon name="chat" />
                    <span>WhatsApp</span>
                  </a>
                </div>
              )}
            </div>
          </div>

          <div className="card scard-box danger-zone">
            <h4>{t('Actions')}</h4>
            {!confirmDelete ? (
              <button
                type="button"
                className="btn sm btn-outline-danger"
                onClick={() => setConfirmDelete(true)}
              >
                <Icon name="trash" />
                <span>{t('Delete this case')}</span>
              </button>
            ) : (
              <div className="confirm-delete-box">
                <p className="danger-text">
                  {t("Delete {id} for good? This can't be undone. Archive keeps the record instead.", { id: student.case_id })}
                </p>
                <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                  <button
                    type="button"
                    className="btn sm"
                    onClick={() => setConfirmDelete(false)}
                  >
                    {t('Keep')}
                  </button>
                  <button
                    type="button"
                    className="btn sm btn-danger"
                    onClick={() => {
                      deleteStudent(student.id);
                      navigate('/students');
                    }}
                  >
                    {t('Delete')}
                  </button>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
