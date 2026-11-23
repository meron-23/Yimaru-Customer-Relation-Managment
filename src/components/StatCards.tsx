import React from 'react';
import { Icon } from './Icon';

export interface StatCardItem {
  key: string;
  label: string;
  count: number | string;
  sub?: string;
  bar?: string;
  fg?: string;
  bg?: string;
  hero?: boolean;
  hint?: string;
}

export function StatCards({
  items,
  value,
  onChange,
  className
}: {
  items: StatCardItem[];
  value: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`scards ${className || ''}`} role="tablist">
      {items.map(t => {
        const on = value === t.key;
        return (
          <button
            key={t.key}
            role="tab"
            aria-selected={on}
            className={`scard ${on ? 'on' : ''} ${t.hero ? 'hero' : ''}`}
            style={
              {
                '--c': t.bar || 'var(--vv)',
                '--cf': t.fg || 'var(--vv)',
                '--cb': t.bg || 'var(--vv-50)'
              } as React.CSSProperties
            }
            onClick={() => onChange(t.key)}
            title={t.hint || ''}
          >
            <span className="sc-top">
              <span className="sc-l">{t.label}</span>
              {on && <Icon name="check" />}
            </span>
            <b className="sc-n">{t.count}</b>
            {t.sub && <span className="sc-s">{t.sub}</span>}
          </button>
        );
      })}
    </div>
  );
}

export interface ChipItem {
  key: string;
  label: string;
  count?: number;
  on?: boolean;
  dot?: string;
  onClick: () => void;
}

export function ChipBar({ items }: { items: ChipItem[] }) {
  return (
    <div className="cbar">
      {items.map(c => (
        <button
          key={c.key}
          className={`cchip ${c.on ? 'on' : ''}`}
          onClick={c.onClick}
          aria-pressed={!!c.on}
        >
          {c.dot && <span className="cchip-dot" style={{ background: c.dot }} />}
          <span>{c.label}</span>
          {c.count !== undefined && <b className="cchip-cnt">{c.count}</b>}
        </button>
      ))}
    </div>
  );
}
