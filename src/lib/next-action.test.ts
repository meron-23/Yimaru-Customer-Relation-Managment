import { describe, it, expect } from 'vitest';
import { statusOf, nextActionOf } from './next-action';
import type { Student } from '../types';

describe('nextActionOf and statusOf (spec §5.3, §5.4)', () => {
  const baseStudent: Student = {
    id: 's-1',
    case_id: 'YIM-2026-0001',
    full_name: 'Binyam Tesfaye',
    phone: '0912345678',
    source: 'Telegram',
    target_countries: ['Italy'],
    risk: 'strong',
    stage: 'registration',
    archived: false,
    sponsor_type: 'self',
    package_type: 'p1',
    financial: {},
    visa: {},
    qc_passed: false,
    appt_requested: false,
    appt_confirmed: false,
    appt_biometrics: false,
    appt_submitted: false,
    interview: {},
    decision: '',
    is_sample: false,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    updated_by: 'system',
    payments: [
      { id: 'p-reg', student_id: 's-1', kind: 'registration', paid: false, amount: 10000, created_at: '', updated_at: '', updated_by: '' },
      { id: 'p-1', student_id: 's-1', kind: 'payment1', paid: false, amount: 150000, created_at: '', updated_at: '', updated_by: '' }
    ]
  };

  it('enforces registration fee gate in Stage 1', () => {
    // Unpaid registration fee
    const stuUnpaid = { ...baseStudent };
    const act = nextActionOf(stuUnpaid);
    expect(act.short).toBe('Collect the registration fee');
    expect(act.tone).toBe('warn');

    // Paid registration fee
    const stuPaid: Student = {
      ...baseStudent,
      payments: [
        { ...baseStudent.payments![0], paid: true },
        baseStudent.payments![1]
      ]
    };
    const actPaid = nextActionOf(stuPaid);
    expect(actPaid.short).toBe('Move to Assessment');
    expect(actPaid.tone).toBe('ok');
  });

  it('guides assessment in Stage 2', () => {
    const stuNoRisk: Student = { ...baseStudent, stage: 'assessment', risk: '' };
    expect(nextActionOf(stuNoRisk).short).toBe('Review the profile');

    const stuWithRisk: Student = { ...baseStudent, stage: 'assessment', risk: 'strong' };
    expect(nextActionOf(stuWithRisk).short).toBe('Move to Onboarding');
  });

  it('guides university admission in Stage 4', () => {
    const stuNoApps: Student = { ...baseStudent, stage: 'admission', applications: [] };
    expect(nextActionOf(stuNoApps).short).toBe('Add universities');

    const stuApplied: Student = {
      ...baseStudent,
      stage: 'admission',
      applications: [
        { id: 'a-1', student_id: 's-1', university: 'Politecnico di Milano', program: 'MSc CS', status: 'Applied', created_at: '', updated_at: '', updated_by: '' }
      ]
    };
    expect(nextActionOf(stuApplied).short).toContain('Waiting on');

    const stuOfferUnpaid: Student = {
      ...baseStudent,
      stage: 'admission',
      applications: [
        { id: 'a-1', student_id: 's-1', university: 'Politecnico di Milano', program: 'MSc CS', status: 'Offer', created_at: '', updated_at: '', updated_by: '' }
      ],
      payments: [
        { id: 'p-reg', student_id: 's-1', kind: 'registration', paid: true, amount: 10000, created_at: '', updated_at: '', updated_by: '' },
        { id: 'p-1', student_id: 's-1', kind: 'payment1', paid: false, amount: 150000, created_at: '', updated_at: '', updated_by: '' }
      ]
    };
    expect(nextActionOf(stuOfferUnpaid).short).toBe('Collect Payment 1');
  });

  it('enforces partner QC sign-off in Stage 5', () => {
    const stuVisaQCNeeded: Student = {
      ...baseStudent,
      stage: 'visafile',
      visa: { passport_copy: true, photos: false },
      qc_passed: false
    };
    expect(nextActionOf(stuVisaQCNeeded).short).toContain('Finish visa documents');

    const stuVisaQCPassed: Student = {
      ...stuVisaQCNeeded,
      qc_passed: true
    };
    expect(nextActionOf(stuVisaQCPassed).short).toBe('Book the visa appointment');
  });

  it('guides visa outcome and final Payment 2 in Stage 7', () => {
    const stuApprovedUnpaid: Student = {
      ...baseStudent,
      stage: 'outcome',
      package_type: 'p2',
      decision: 'approved',
      payments: [
        { id: 'p-reg', student_id: 's-1', kind: 'registration', paid: true, amount: 10000, created_at: '', updated_at: '', updated_by: '' },
        { id: 'p-1', student_id: 's-1', kind: 'payment1', paid: true, amount: 150000, created_at: '', updated_at: '', updated_by: '' },
        { id: 'p-2', student_id: 's-1', kind: 'payment2', paid: false, amount: 150000, created_at: '', updated_at: '', updated_by: '' }
      ]
    };
    expect(nextActionOf(stuApprovedUnpaid).short).toBe('Collect Payment 2');

    const stuApprovedPaid: Student = {
      ...stuApprovedUnpaid,
      payments: stuApprovedUnpaid.payments!.map(p => ({ ...p, paid: true }))
    };
    expect(nextActionOf(stuApprovedPaid).short).toBe('Help with travel');
  });

  it('returns appropriate status label and tone', () => {
    const stu = { ...baseStudent, stage: 'registration' as const };
    const stat = statusOf(stu);
    expect(stat.label).toBe('Registration fee due');
    expect(stat.tone).toBe('magenta');
  });
});
