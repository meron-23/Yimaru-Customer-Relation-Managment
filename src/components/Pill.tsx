import React from 'react';
import type { Student } from '../types';
import { statusOf } from '../lib/next-action';
import { useTranslation } from 'react-i18next';

export const PILL_DOT: Record<string, string> = {
  magenta: '#C2459F',
  amber: '#D9A400',
  teal: '#14B88E',
  green: '#4FA02A',
  red: '#D64545',
  purple: '#7E5BD0',
  grey: '#A39BA8',
  ok: '#4FA02A',
  warn: '#D9A400',
  todo: '#7E5BD0',
  bad: '#D64545'
};

export function Pill({ tone = 'grey', children }: { tone?: string; children: React.ReactNode }) {
  return (
    <span className={`pill pl-${tone}`}>
      <i style={{ background: PILL_DOT[tone] || PILL_DOT.grey }} />
      {children}
    </span>
  );
}

export function StatusPill({ student }: { student: Student }) {
  const { t } = useTranslation();
  const s = statusOf(student);
  let text = t(s.label);
  if (s.params) {
    for (const [k, v] of Object.entries(s.params)) {
      text = text.replace(new RegExp(`\\{\\{${k}\\}\\}|\\{${k}\\}`, 'g'), String(v));
    }
  }
  return <Pill tone={s.tone}>{text}</Pill>;
}
