/**
 * Next-action logic (spec §5.4) and status-label logic (spec §5.3).
 * Both are pure functions — no side effects.
 */
import type { Student } from '../types';

export type Tone = 'grey' | 'magenta' | 'teal' | 'green' | 'red' | 'purple' | 'amber' | 'ok' | 'warn' | 'todo' | 'bad';

export interface StatusLabel {
  label: string; // English key (translated by caller)
  tone: Tone;
  params?: Record<string, string | number>;
}

export interface NextAction {
  long: string;   // English key
  short: string;  // English key
  tone: Tone;
  params?: Record<string, string | number>;
}

/** §5.3 — current status pill */
export function statusOf(stu: Student): StatusLabel {
  if (stu.archived) return { label: 'Archived', tone: 'grey' };
  if (stu.decision === 'approved') return { label: 'Visa approved', tone: 'green' };
  if (stu.decision === 'refused') return { label: 'Visa refused', tone: 'red' };
  if (stu.decision === 'additional') return { label: 'Embassy asked for more', tone: 'amber' };

  const regPaid = (stu.payments ?? []).find(p => p.kind === 'registration')?.paid ?? false;

  switch (stu.stage) {
    case 'registration':
      return regPaid
        ? { label: 'Registered, ready to start', tone: 'teal' }
        : { label: 'Registration fee due', tone: 'magenta' };
    case 'assessment':
      return { label: 'Profile being assessed', tone: 'purple' };
    case 'onboarding':
      return { label: 'Onboarding', tone: 'purple' };
    case 'admission': {
      const apps = stu.applications ?? [];
      if (apps.some(a => a.status === 'Offer' || a.status === 'Enrolled'))
        return { label: 'Offer received', tone: 'teal' };
      if (apps.length)
        return { label: 'Applying to {n} universities', tone: 'teal', params: { n: apps.length } };
      return { label: 'Planning applications', tone: 'teal' };
    }
    case 'visafile':
      return stu.qc_passed
        ? { label: 'Visa file ready', tone: 'teal' }
        : { label: 'Building visa file', tone: 'purple' };
    case 'submitted':
      return { label: 'At the embassy', tone: 'amber' };
    case 'outcome':
      return { label: 'Awaiting decision', tone: 'amber' };
    default:
      return { label: stu.stage, tone: 'grey' };
  }
}

/** §5.4 — next action sentence */
export function nextActionOf(stu: Student): NextAction {
  if (stu.archived)
    return { long: 'This case is archived. Restore it to keep working on it.', short: 'Archived', tone: 'grey' };

  const payments = stu.payments ?? [];
  const regPaid = payments.find(p => p.kind === 'registration')?.paid ?? false;
  const p1Paid  = payments.find(p => p.kind === 'payment1')?.paid ?? false;
  const p2Paid  = payments.find(p => p.kind === 'payment2')?.paid ?? false;
  const apps    = stu.applications ?? [];

  switch (stu.stage) {
    case 'registration':
      if (!regPaid)
        return { long: "Collect the registration fee. Nothing else can start until it's recorded.", short: 'Collect the registration fee', tone: 'warn' };
      return { long: 'Registration fee is recorded. Move the case to Assessment.', short: 'Move to Assessment', tone: 'ok' };

    case 'assessment':
      if (!stu.risk)
        return { long: 'Review the profile and set a risk level.', short: 'Review the profile', tone: 'todo' };
      return { long: 'Risk level is set. Agree the study plan next.', short: 'Move to Onboarding', tone: 'ok' };

    case 'onboarding':
      if (!stu.strategy_university)
        return { long: 'Agree the study plan: destination, university and programme.', short: 'Agree the study plan', tone: 'todo' };
      return { long: 'Study plan is in place. Start the university applications.', short: 'Start applications', tone: 'ok' };

    case 'admission': {
      const hasOffer = apps.some(a => a.status === 'Offer' || a.status === 'Enrolled');
      const waiting  = apps.filter(a => !['Offer', 'Enrolled', 'Rejected'].includes(a.status)).length;
      if (!apps.length)
        return { long: 'Add the universities this student is applying to.', short: 'Add universities', tone: 'todo' };
      if (!hasOffer)
        return { long: 'Waiting on {n} applications.', short: 'Waiting on {n} {uni}', tone: 'todo', params: { n: waiting, uni: waiting === 1 ? 'university' : 'universities' } };
      if (!p1Paid)
        return { long: 'Offer received. Collect Payment 1, then start the visa file.', short: 'Collect Payment 1', tone: 'warn' };
      return { long: 'Offer received. Move on to the visa file.', short: 'Start the visa file', tone: 'ok' };
    }

    case 'visafile': {
      if (!stu.qc_passed) {
        const done  = Object.values(stu.visa ?? {}).filter(Boolean).length;
        const total = Object.keys(stu.visa ?? {}).length;
        return { long: '{a} of {b} documents ready. Finish the file and get QC sign-off.', short: 'Finish visa documents ({a}/{b})', tone: 'todo', params: { a: done, b: total } };
      }
      return { long: 'File is signed off. Book the visa appointment.', short: 'Book the visa appointment', tone: 'ok' };
    }

    case 'submitted':
      if (!stu.appt_submitted)
        return { long: 'Book the appointment and lodge the file.', short: 'Book appointment, lodge file', tone: 'todo' };
      return { long: 'Lodged with the embassy. Waiting for a decision.', short: 'Waiting for the embassy', tone: 'todo' };

    case 'outcome': {
      if (!stu.decision)
        return { long: 'Record the visa decision.', short: 'Record the visa decision', tone: 'todo' };
      if (stu.decision === 'additional')
        return { long: 'The embassy asked for more documents. Send them and note it here.', short: 'Send the extra documents', tone: 'warn' };
      if (stu.decision === 'refused')
        return { long: 'Visa refused. Review the reasons and decide whether to reapply.', short: 'Decide whether to reapply', tone: 'bad' };
      // approved
      if (stu.package_type === 'p2' && !p2Paid)
        return { long: 'Visa approved. Collect Payment 2.', short: 'Collect Payment 2', tone: 'warn' };
      return { long: 'Visa approved. Help with travel and arrival.', short: 'Help with travel', tone: 'ok' };
    }

    default:
      return { long: 'No action found.', short: '', tone: 'grey' };
  }
}
