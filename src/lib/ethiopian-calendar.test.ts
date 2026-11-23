/**
 * Unit tests for the Ethiopian calendar.
 * Run with: npx vitest run src/lib/ethiopian-calendar.test.ts
 *
 * Required test dates from spec §7.1 — all must pass.
 */
import { describe, it, expect } from 'vitest';
import { toEth, fromEth, ethMonthDays } from './ethiopian-calendar';

describe('toEth – Gregorian → Ethiopian', () => {
  it('ordinary day: 2026-11-20 → Hidar 11, 2019', () => {
    expect(toEth('2026-11-20')).toEqual({ y: 2019, m: 3, d: 11 });
  });
  it('last day of a 5-day Pagume: 2026-09-10 → Pagume 5, 2018', () => {
    expect(toEth('2026-09-10')).toEqual({ y: 2018, m: 13, d: 5 });
  });
  it('New Year 2019: 2026-09-11 → Meskerem 1, 2019', () => {
    expect(toEth('2026-09-11')).toEqual({ y: 2019, m: 1, d: 1 });
  });
  it('Genna: 2027-01-07 → Tahsas 29, 2019', () => {
    expect(toEth('2027-01-07')).toEqual({ y: 2019, m: 4, d: 29 });
  });
  it('Timket: 2024-01-19 → Tir 10, 2016', () => {
    expect(toEth('2024-01-19')).toEqual({ y: 2016, m: 5, d: 10 });
  });
  it('leap Pagume 6: 2027-09-11 → Pagume 6, 2019', () => {
    expect(toEth('2027-09-11')).toEqual({ y: 2019, m: 13, d: 6 });
  });
  it('New Year after leap: 2027-09-12 → Meskerem 1, 2020', () => {
    expect(toEth('2027-09-12')).toEqual({ y: 2020, m: 1, d: 1 });
  });
});

describe('fromEth – Ethiopian → Gregorian (round-trip)', () => {
  const cases: [number, number, number, string][] = [
    [2019, 3, 11, '2026-11-20'],
    [2018, 13, 5, '2026-09-10'],
    [2019, 1, 1, '2026-09-11'],
    [2019, 4, 29, '2027-01-07'],
    [2016, 5, 10, '2024-01-19'],
    [2019, 13, 6, '2027-09-11'],
    [2020, 1, 1, '2027-09-12'],
  ];
  for (const [y, m, d, expected] of cases) {
    it(`fromEth(${y}, ${m}, ${d}) → ${expected}`, () => {
      expect(fromEth(y, m, d)).toBe(expected);
    });
  }
});

describe('ethMonthDays', () => {
  it('regular month has 30 days', () => {
    expect(ethMonthDays(2019, 1)).toBe(30);
    expect(ethMonthDays(2019, 12)).toBe(30);
  });
  it('Pagume 2018 (year % 4 ≠ 3) has 5 days', () => {
    expect(ethMonthDays(2018, 13)).toBe(5);
  });
  it('Pagume 2019 (year % 4 === 3) has 6 days', () => {
    expect(ethMonthDays(2019, 13)).toBe(6);
  });
});
