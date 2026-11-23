import { describe, it, expect } from 'vitest';
import { leadBucket, applyLeadCall, nextLeadCode, waLink } from './leads';
import type { Lead } from '../types';

describe('leadBucket (spec §5.5)', () => {
  const baseLead: Lead = {
    id: 'l-1',
    code: 'L-001',
    name: 'Abebe Kebede',
    phone: '0911223344',
    source: 'Telegram',
    status: 'open',
    call_attempts: 0,
    next_call_on: '2026-11-20',
    is_sample: false,
    created_at: '2026-11-20T10:00:00Z',
    updated_at: '2026-11-20T10:00:00Z',
    updated_by: 'system'
  };

  it('identifies uncalled leads when call_attempts is 0', () => {
    expect(leadBucket(baseLead, '2026-11-20')).toBe('uncalled');
  });

  it('identifies today calls when next_call_on matches today', () => {
    const lead = { ...baseLead, call_attempts: 1, next_call_on: '2026-11-20' };
    expect(leadBucket(lead, '2026-11-20')).toBe('today');
  });

  it('identifies overdue calls when next_call_on is in the past', () => {
    const lead = { ...baseLead, call_attempts: 1, next_call_on: '2026-11-18' };
    expect(leadBucket(lead, '2026-11-20')).toBe('overdue');
  });

  it('identifies waiting calls when next_call_on is in the future', () => {
    const lead = { ...baseLead, call_attempts: 1, next_call_on: '2026-11-25' };
    expect(leadBucket(lead, '2026-11-20')).toBe('waiting');
  });

  it('identifies converted leads', () => {
    const lead: Lead = { ...baseLead, status: 'converted' };
    expect(leadBucket(lead, '2026-11-20')).toBe('converted');
  });

  it('identifies closed leads', () => {
    const lead: Lead = { ...baseLead, status: 'closed' };
    expect(leadBucket(lead, '2026-11-20')).toBe('closed');
  });
});

describe('applyLeadCall and Cadence (spec §5.5)', () => {
  const baseLead: Lead = {
    id: 'l-1',
    code: 'L-001',
    name: 'Tigist Alemu',
    phone: '0922334455',
    status: 'open',
    call_attempts: 0,
    next_call_on: '2026-11-20',
    is_sample: false,
    created_at: '2026-11-20T08:00:00Z',
    updated_at: '2026-11-20T08:00:00Z',
    updated_by: 'system'
  };

  const cadence = [0, 1, 3, 7, 14];

  it('schedules next call on day 1 after 1st no_answer call', () => {
    const res = applyLeadCall(baseLead, 'no_answer', cadence, undefined, '2026-11-20');
    expect(res.call_attempts).toBe(1);
    expect(res.status).toBe('open');
    expect(res.next_call_on).toBe('2026-11-21'); // +1 day
  });

  it('schedules next call on day 3 (+2 days) after 2nd no_answer call', () => {
    const lead2: Lead = { ...baseLead, call_attempts: 1, next_call_on: '2026-11-21' };
    const res = applyLeadCall(lead2, 'no_answer', cadence, undefined, '2026-11-21');
    expect(res.call_attempts).toBe(2);
    expect(res.status).toBe('open');
    expect(res.next_call_on).toBe('2026-11-23'); // +2 days from day 1 to day 3
  });

  it('automatically closes lead as no_response on the 5th unanswered call', () => {
    const lead4: Lead = { ...baseLead, call_attempts: 4, next_call_on: '2026-12-04' };
    const res = applyLeadCall(lead4, 'no_answer', cadence, undefined, '2026-12-04');
    expect(res.call_attempts).toBe(5);
    expect(res.status).toBe('closed');
    expect(res.close_reason).toBe('no_response');
  });

  it('closes lead immediately if not_interested', () => {
    const res = applyLeadCall(baseLead, 'not_interested', cadence, undefined, '2026-11-20');
    expect(res.status).toBe('closed');
    expect(res.close_reason).toBe('not_interested');
  });

  it('closes lead immediately if out_of_scope', () => {
    const res = applyLeadCall(baseLead, 'out_of_scope', cadence, undefined, '2026-11-20');
    expect(res.status).toBe('closed');
    expect(res.close_reason).toBe('out_of_scope');
  });

  it('schedules next call on answered call with custom date or default gap', () => {
    const res1 = applyLeadCall(baseLead, 'answered', cadence, '2026-11-28', '2026-11-20');
    expect(res1.status).toBe('open');
    expect(res1.next_call_on).toBe('2026-11-28');

    const res2 = applyLeadCall(baseLead, 'answered', cadence, undefined, '2026-11-20');
    expect(res2.status).toBe('open');
    expect(res2.next_call_on).toBe('2026-11-22'); // +2 days default
  });
});

describe('nextLeadCode and waLink', () => {
  it('generates L-001 when empty', () => {
    expect(nextLeadCode([])).toBe('L-001');
  });

  it('generates next sequential code', () => {
    expect(nextLeadCode(['L-001', 'L-002', 'L-015'])).toBe('L-016');
  });

  it('formats Ethiopian phone numbers into international WhatsApp links', () => {
    expect(waLink('0911223344')).toBe('https://wa.me/251911223344');
    expect(waLink('+251911223344')).toBe('https://wa.me/251911223344');
  });
});
