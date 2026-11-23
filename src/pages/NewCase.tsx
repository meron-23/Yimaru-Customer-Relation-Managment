import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Icon } from '../components/Icon';
import { ComboBox } from '../components/ComboBox';
import {
  COUNTRY_NAMES,
  SOURCES,
  EDUCATION_LEVELS,
  STUDY_LEVELS,
  INTAKES,
  PASSPORT_STATUSES
} from '../lib/reference-data';
import type { Student } from '../types';

export default function NewCase() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { createStudent } = useData();
  const { users, currentUser } = useAuth();

  const [formData, setFormData] = useState<Partial<Student>>({
    full_name: '',
    phone: '',
    email: '',
    source: 'Walk-in',
    age: '',
    education: 'BSc',
    gpa: '',
    graduation_year: '',
    field_of_study: '',
    english_proficiency: 'IELTS 6.5',
    work_experience: '',
    study_level: 'Master',
    target_countries: [],
    strategy_country: 'Italy',
    strategy_university: '',
    strategy_program: '',
    package_type: 'p1',
    sponsor_type: 'self',
    budget: '',
    sponsor: 'Parent',
    sponsor_relationship: 'Father',
    passport_status: 'Valid',
    previous_visa_history: 'None',
    previous_refusals: 'None',
    intended_intake: 'Sept 2026',
    officer: currentUser?.full_name || ''
  });

  const [error, setError] = useState('');

  const update = (key: keyof Student, val: any) => {
    setFormData(prev => ({ ...prev, [key]: val }));
    setError('');
  };

  const officerNames = Array.from(new Set(users.map(u => u.full_name)));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!formData.full_name?.trim()) {
      setError(t('Add the student’s name to create the case.'));
      return;
    }
    const created = createStudent({
      ...formData,
      full_name: formData.full_name.trim(),
      target_countries: formData.strategy_country ? [formData.strategy_country] : []
    });
    navigate(`/students/${created.id}`);
  }

  return (
    <div className="pg narrow">
      {/* Breadcrumb */}
      <div className="crumb">
        <button type="button" onClick={() => navigate('/students')}>
          <Icon name="back" />
          <span>{t('Students')}</span>
        </button>
        <Icon name="right" />
        <span>{t('New case')}</span>
      </div>

      <div className="page-head">
        <div>
          <h1 className="page-title">{t('New case')}</h1>
          <p className="page-sub">
            {t('A case number is assigned when you create it.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 12 }}>
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate('/students')}
          >
            {t('Cancel')}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSubmit}
          >
            <Icon name="check" />
            <span>{t('Create case')}</span>
          </button>
        </div>
      </div>

      {error && (
        <div className="form-alert error">
          <Icon name="alert" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="form-wrap">
        {/* Section 1: Contact */}
        <section className="fsec">
          <div className="fsec-h">
            <span className="fsec-n" style={{ background: '#F39A5B' }}>1</span>
            <div>
              <h2>{t('Contact')}</h2>
              <p>{t('Who the student is and how to reach them.')}</p>
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Full name')} *</span>
              <input
                className="input"
                value={formData.full_name}
                onChange={e => update('full_name', e.target.value)}
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
              <span className="field-lbl">{t('Email')}</span>
              <input
                className="input"
                type="email"
                value={formData.email}
                onChange={e => update('email', e.target.value)}
                placeholder="student@example.com"
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
        </section>

        {/* Section 2: Academic Background */}
        <section className="fsec">
          <div className="fsec-h">
            <span className="fsec-n" style={{ background: '#6E9EEA' }}>2</span>
            <div>
              <h2>{t('Academic background')}</h2>
              <p>{t('Education, grades and qualifications.')}</p>
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Study level')}</span>
              <select
                className="select"
                value={formData.study_level}
                onChange={e => update('study_level', e.target.value)}
              >
                {STUDY_LEVELS.map(l => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Education')}</span>
              <select
                className="select"
                value={formData.education}
                onChange={e => update('education', e.target.value)}
              >
                {EDUCATION_LEVELS.map(ed => (
                  <option key={ed} value={ed}>{ed}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Field of study')}</span>
              <input
                className="input"
                value={formData.field_of_study}
                onChange={e => update('field_of_study', e.target.value)}
                placeholder="e.g. Computer Science"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('GPA')}</span>
              <input
                className="input"
                value={formData.gpa}
                onChange={e => update('gpa', e.target.value)}
                placeholder="e.g. 3.4"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Graduation year')}</span>
              <input
                className="input"
                value={formData.graduation_year}
                onChange={e => update('graduation_year', e.target.value)}
                placeholder="e.g. 2024"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('English proficiency')}</span>
              <input
                className="input"
                value={formData.english_proficiency}
                onChange={e => update('english_proficiency', e.target.value)}
                placeholder="e.g. IELTS 6.5, Duolingo 120"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Age')}</span>
              <input
                className="input"
                value={formData.age}
                onChange={e => update('age', e.target.value)}
                placeholder="e.g. 23"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Work experience')}</span>
              <input
                className="input"
                value={formData.work_experience}
                onChange={e => update('work_experience', e.target.value)}
                placeholder="e.g. 2 years software engineer"
              />
            </label>
          </div>
        </section>

        {/* Section 3: Study Plan & Strategy */}
        <section className="fsec">
          <div className="fsec-h">
            <span className="fsec-n" style={{ background: '#A386E3' }}>3</span>
            <div>
              <h2>{t('Study plan')}</h2>
              <p>{t('Target destination, package and university.')}</p>
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Destination country')}</span>
              <ComboBox
                value={formData.strategy_country || ''}
                options={COUNTRY_NAMES}
                onChange={v => update('strategy_country', v)}
                placeholder={t('Select country…')}
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Package')}</span>
              <select
                className="select"
                value={formData.package_type}
                onChange={e => update('package_type', e.target.value)}
              >
                <option value="p1">{t('Package 1')} ({t('Consulting & admission')})</option>
                <option value="p2">{t('Package 2')} ({t('Full journey through visa')})</option>
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Intended intake')}</span>
              <select
                className="select"
                value={formData.intended_intake}
                onChange={e => update('intended_intake', e.target.value)}
              >
                {INTAKES.map(it => (
                  <option key={it} value={it}>{it}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Funding')}</span>
              <select
                className="select"
                value={formData.sponsor_type}
                onChange={e => update('sponsor_type', e.target.value)}
              >
                <option value="self">{t('Self-sponsored')}</option>
                <option value="scholarship">{t('Scholarship')}</option>
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Target university')}</span>
              <input
                className="input"
                value={formData.strategy_university}
                onChange={e => update('strategy_university', e.target.value)}
                placeholder="e.g. University of Bologna"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Target program')}</span>
              <input
                className="input"
                value={formData.strategy_program}
                onChange={e => update('strategy_program', e.target.value)}
                placeholder="e.g. MSc Computer Science"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Officer handling case')}</span>
              <select
                className="select"
                value={formData.officer}
                onChange={e => update('officer', e.target.value)}
              >
                <option value="">{t('Unassigned')}</option>
                {officerNames.map(name => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>
          </div>
        </section>

        {/* Section 4: Sponsor and Visa History */}
        <section className="fsec">
          <div className="fsec-h">
            <span className="fsec-n" style={{ background: '#DB7FC6' }}>4</span>
            <div>
              <h2>{t('Sponsor and visa history')}</h2>
              <p>{t('Financial backing and immigration background.')}</p>
            </div>
          </div>
          <div className="grid2">
            <label className="field">
              <span className="field-lbl">{t('Sponsor')}</span>
              <input
                className="input"
                value={formData.sponsor}
                onChange={e => update('sponsor', e.target.value)}
                placeholder="e.g. Father, Self"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Sponsor relationship')}</span>
              <input
                className="input"
                value={formData.sponsor_relationship}
                onChange={e => update('sponsor_relationship', e.target.value)}
                placeholder="e.g. Father, Mother, Uncle"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Budget')}</span>
              <input
                className="input"
                value={formData.budget}
                onChange={e => update('budget', e.target.value)}
                placeholder="e.g. 500,000 ETB"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Passport status')}</span>
              <select
                className="select"
                value={formData.passport_status}
                onChange={e => update('passport_status', e.target.value)}
              >
                {PASSPORT_STATUSES.map(p => (
                  <option key={p} value={p}>{t(p)}</option>
                ))}
              </select>
            </label>

            <label className="field">
              <span className="field-lbl">{t('Previous visa history')}</span>
              <input
                className="input"
                value={formData.previous_visa_history}
                onChange={e => update('previous_visa_history', e.target.value)}
                placeholder="e.g. None, UAE tourist visa"
              />
            </label>

            <label className="field">
              <span className="field-lbl">{t('Previous refusals')}</span>
              <input
                className="input"
                value={formData.previous_refusals}
                onChange={e => update('previous_refusals', e.target.value)}
                placeholder="e.g. None, Germany (2023)"
              />
            </label>
          </div>
        </section>

        <div className="form-submit-row">
          <button
            type="button"
            className="btn btn-outline"
            onClick={() => navigate('/students')}
          >
            {t('Cancel')}
          </button>
          <button
            type="submit"
            className="btn btn-primary"
          >
            <Icon name="check" />
            <span>{t('Create case')}</span>
          </button>
        </div>
      </form>
    </div>
  );
}
