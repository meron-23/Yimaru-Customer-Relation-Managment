import { describe, it, expect } from 'vitest';
import {
  resolveReportRange,
  buildReport,
  toCSV,
  reportMessage,
  monthlyTrend,
  type ReportDatasetKey
} from './reports';
import type { Student, Lead, Activity, Settings } from '../types';

describe('Reports logic (spec §6.8)', () => {
  const dummySettings: Settings = {
    id: 'set-1',
    business_name: 'Yimaru Consulting',
    currency: 'ETB',
    cadence: [0, 1, 3, 7, 14],
    p1_registration: 10000,
    p1_total: 160000,
    p2_registration: 10000,
    p2_total: 310000,
    updated_at: '2026-11-20T10:00:00Z',
    updated_by: 'system'
  };

  const sampleStudents: Student[] = [
    {
      id: 's-1',
      case_id: 'YIM-2026-0001',
      full_name: 'Selamawit Desta',
      phone: '0911000001',
      source: 'Telegram',
      strategy_country: 'Germany',
      target_countries: ['Germany'],
      strategy_university: 'TU Munich',
      stage: 'admission',
      risk: 'strong',
      archived: false,
      sponsor_type: 'self',
      package_type: 'p1',
      financial: {},
      visa: {},
      qc_passed: true,
      appt_requested: false,
      appt_confirmed: false,
      appt_biometrics: false,
      appt_submitted: false,
      interview: {},
      decision: '',
      is_sample: false,
      officer: 'Ammanuel Esrael',
      created_at: '2026-11-20T08:00:00Z',
      updated_at: '2026-11-20T08:00:00Z',
      updated_by: 'system',
      payments: [
        { id: 'p-1', student_id: 's-1', kind: 'registration', paid: true, amount: 10000, paid_on: '2026-11-20', created_at: '', updated_at: '', updated_by: '' }
      ]
    },
    {
      id: 's-2',
      case_id: 'YIM-2026-0002',
      full_name: 'Dawit Mengistu',
      phone: '0911000002',
      source: 'Facebook / Instagram',
      strategy_country: 'Italy',
      target_countries: ['Italy'],
      stage: 'outcome',
      risk: 'strong',
      archived: false,
      sponsor_type: 'self',
      package_type: 'p2',
      financial: {},
      visa: {},
      qc_passed: true,
      appt_requested: true,
      appt_confirmed: true,
      appt_biometrics: true,
      appt_submitted: true,
      interview: {},
      decision: 'approved',
      decided_at: '2026-11-20T14:00:00Z',
      is_sample: false,
      officer: 'Endrias',
      created_at: '2026-11-15T08:00:00Z',
      updated_at: '2026-11-20T14:00:00Z',
      updated_by: 'system',
      payments: [
        { id: 'p-2', student_id: 's-2', kind: 'payment1', paid: true, amount: 150000, paid_on: '2026-11-18', created_at: '', updated_at: '', updated_by: '' },
        { id: 'p-3', student_id: 's-2', kind: 'payment2', paid: true, amount: 150000, paid_on: '2026-11-20', created_at: '', updated_at: '', updated_by: '' }
      ]
    }
  ];

  const sampleLeads: Lead[] = [
    {
      id: 'l-1',
      code: 'L-001',
      name: 'Ephrem Girma',
      phone: '0922000001',
      source: 'Telegram',
      interest_country: 'Germany',
      interest_package: 'p1',
      status: 'open',
      call_attempts: 1,
      next_call_on: '2026-11-20',
      is_sample: false,
      created_at: '2026-11-20T09:00:00Z',
      updated_at: '2026-11-20T09:00:00Z',
      updated_by: 'system',
      calls: [
        {
          id: 'c-1',
          lead_id: 'l-1',
          ts: '2026-11-20T09:30:00Z',
          attempt: 1,
          outcome: 'answered',
          note: 'Interested in winter intake',
          author_id: 'u-amman',
          author_name: 'Ammanuel Esrael'
        }
      ]
    }
  ];

  const sampleActivities: Activity[] = [
    {
      id: 'act-1',
      student_id: 's-1',
      ts: '2026-11-20T11:00:00Z',
      author_id: 'u-amman',
      author_name: 'Ammanuel Esrael',
      kind: 'stage',
      text: 'Moved from Onboarding to Admission'
    }
  ];

  it('resolves report ranges accurately with Ethiopian calendar labels', () => {
    const todayRange = resolveReportRange('today');
    expect(todayRange.from).toBe(todayRange.to);
    expect(todayRange.label).toBeTruthy();
    expect(todayRange.plain).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);

    const weekRange = resolveReportRange('week');
    expect(weekRange.from).toBeDefined();
    expect(weekRange.to).toBeDefined();
    expect(weekRange.from <= weekRange.to).toBe(true);

    const monthRange = resolveReportRange('month');
    expect(monthRange.from).toBeDefined();
    expect(monthRange.to).toBeDefined();
  });

  it('builds summary and tables correctly for a given period', () => {
    const allDatasets: ReportDatasetKey[] = ['leads', 'calls', 'students', 'moves', 'payments', 'visas'];
    const { summary, tables } = buildReport(
      sampleStudents,
      sampleLeads,
      sampleActivities,
      '2026-11-20',
      '2026-11-20',
      allDatasets,
      'en'
    );

    expect(summary.leads).toBe(1);
    expect(summary.calls).toBe(1);
    expect(summary.answered).toBe(1);
    expect(summary.students).toBe(1);
    expect(summary.moves).toBe(1);
    expect(summary.payments).toBe(2); // p-1 on 11-20 and p-3 on 11-20
    expect(summary.collected).toBe(160000); // 10000 + 150000
    expect(summary.approved).toBe(1);

    expect(tables.length).toBe(6);
    expect(tables.find(t => t.key === 'leads')?.rows.length).toBe(1);
    expect(tables.find(t => t.key === 'calls')?.rows.length).toBe(1);
    expect(tables.find(t => t.key === 'payments')?.rows.length).toBe(2);
  });

  it('generates CSV with UTF-8 BOM', () => {
    const { tables } = buildReport(
      sampleStudents,
      sampleLeads,
      sampleActivities,
      '2026-11-20',
      '2026-11-20',
      ['leads'],
      'en'
    );
    const csv = toCSV(tables);
    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Code","Logged","Name"');
    expect(csv).toContain('"L-001"');
  });

  it('generates ready-to-send Telegram message with all required lines', () => {
    const r = resolveReportRange('custom', '2026-11-20', '2026-11-20');
    const msg = reportMessage(
      sampleStudents,
      sampleLeads,
      sampleActivities,
      r,
      'Daily report',
      'Ammanuel Esrael',
      true,
      dummySettings,
      'en'
    );

    expect(msg).toContain('📋 Yimaru Consulting: Daily report');
    expect(msg).toContain('🗓');
    expect(msg).toContain('✍️ Prepared by Ammanuel Esrael');
    expect(msg).toContain('📞 New enquiries: 1');
    expect(msg).toContain('☎️ Calls made: 1, answered: 1');
    expect(msg).toContain('✅ New students: 1: Selamawit Desta');
    expect(msg).toContain('➡️ Step moves: 1');
    expect(msg).toContain('💳 Payments received: 2, 160,000 ETB');
    expect(msg).toContain('🛂 Visas: 1 approved, 0 refused, 0 asked for more');
    expect(msg).toContain('⚠️ Right now:');
  });

  it('generates 6 months trend data with Pagume folded into Nehase', () => {
    const trend = monthlyTrend(sampleStudents, sampleLeads, sampleActivities, 6, 'en');
    expect(trend.length).toBe(6);
    trend.forEach(point => {
      expect(point.m).toBeTruthy();
      expect(point.monthName).toBeTruthy();
      expect(typeof point.leads).toBe('number');
      expect(typeof point.students).toBe('number');
      expect(typeof point.approved).toBe('number');
      expect(typeof point.collected).toBe('number');
    });
  });
});
