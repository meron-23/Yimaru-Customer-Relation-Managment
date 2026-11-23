/**
 * Lead bucket helper (spec §5.5).
 * Bucket determines which filter card the lead appears under.
 */
import type { Lead, LeadBucket } from '../types';

export function leadBucket(lead: Lead, today: string): LeadBucket {
  if (lead.status === 'converted') return 'converted';
  if (lead.status === 'closed') return 'closed';
  if (lead.call_attempts === 0) return 'uncalled';
  const d = lead.next_call_on ?? today;
  if (d < today) return 'overdue';
  if (d === today) return 'today';
  return 'waiting';
}

/**
 * Apply a logged call to a lead (spec §5.5).
 * Returns the mutated lead fields (do not apply to DB directly — go through the API).
 */
export function applyLeadCall(
  lead: Lead,
  outcome: 'no_answer' | 'answered' | 'not_interested' | 'out_of_scope',
  cadence: number[],
  answeredNextDate?: string,
  today?: string,
): Partial<Lead> {
  const t = today ?? new Date().toISOString().slice(0, 10);
  const plan = cadence?.length ? cadence : [0, 1, 3, 7, 14];
  const attempts = lead.call_attempts + 1;
  let status = lead.status;
  let next_call_on = lead.next_call_on;
  let close_reason = lead.close_reason;

  if (outcome === 'not_interested' || outcome === 'out_of_scope') {
    status = 'closed';
    close_reason = outcome === 'not_interested' ? 'not_interested' : 'out_of_scope';
  } else if (outcome === 'answered') {
    next_call_on = answeredNextDate ?? addDays(t, 2);
  } else {
    // no_answer
    if (attempts >= plan.length) {
      status = 'closed';
      close_reason = 'no_response';
    } else {
      const gap = plan[attempts] - plan[attempts - 1];
      next_call_on = addDays(t, gap > 0 ? gap : 2);
    }
  }

  return { call_attempts: attempts, status, next_call_on, close_reason };
}

function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d + n));
  return dt.toISOString().slice(0, 10);
}

/** Generate WhatsApp direct chat link (adds 251 prefix to Ethiopian phone numbers) */
export function waLink(phone?: string | null): string | null {
  if (!phone) return null;
  let d = String(phone).replace(/\D/g, '');
  if (!d) return null;
  if (d.startsWith('0')) d = '251' + d.slice(1);
  return `https://wa.me/${d}`;
}


/** Generate next lead code: highest L-NNN + 1 */
export function nextLeadCode(existingCodes: string[]): string {
  let max = 0;
  for (const code of existingCodes) {
    const m = code.match(/^L-(\d+)$/);
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `L-${String(max + 1).padStart(3, '0')}`;
}

/** Generate next case ID for a given Gregorian year */
export function nextCaseId(year: number, existingIds: string[]): string {
  let max = 0;
  for (const id of existingIds) {
    const m = id.match(new RegExp(`^YIM-${year}-(\\d+)$`));
    if (m) max = Math.max(max, parseInt(m[1], 10));
  }
  return `YIM-${year}-${String(max + 1).padStart(4, '0')}`;
}
