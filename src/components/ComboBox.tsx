import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

interface ComboBoxProps {
  value: string;
  onChange: (val: string) => void;
  onPick?: (val: string) => void;
  options: string[];
  placeholder?: string;
  label?: string;
  exclude?: string[];
  autoFocus?: boolean;
}

export function ComboBox({
  value,
  onChange,
  onPick,
  options,
  placeholder,
  label,
  exclude,
  autoFocus
}: ComboBoxProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [hi, setHi] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const q = (value || '').trim().toLowerCase();
  const ex = new Set((exclude || []).map(x => x.toLowerCase()));

  const shown = (() => {
    const pool = options.filter(o => !ex.has(o.toLowerCase()));
    if (!q) return pool;
    const name = (o: string) => `${o} ${t(o)}`.toLowerCase();
    const starts = pool.filter(
      o => o.toLowerCase().startsWith(q) || t(o).toLowerCase().startsWith(value.trim().toLowerCase())
    );
    const has = pool.filter(o => !starts.includes(o) && name(o).includes(q));
    return [...starts, ...has];
  })();

  const exact = shown.some(o => o.toLowerCase() === q);
  const rows: { k: string; label: string; free?: boolean }[] = [
    ...shown.map(o => ({ k: o, label: o })),
    ...(q && !exact && !ex.has(q) ? [{ k: '__free', label: value.trim(), free: true }] : [])
  ];

  useEffect(() => {
    setHi(0);
  }, [value]);

  useEffect(() => {
    const el = listRef.current?.querySelector('.cb-o.hi');
    el?.scrollIntoView({ block: 'nearest' });
  }, [hi, open]);

  const choose = (row: { k: string; label: string; free?: boolean }) => {
    if (!row) return;
    onChange(row.label);
    setOpen(false);
    onPick?.(row.label);
  };

  function onKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setOpen(true);
      setHi(h => Math.min(h + 1, rows.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHi(h => Math.max(h - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (open && rows[hi]) choose(rows[hi]);
      else if (value.trim()) {
        setOpen(false);
        onPick?.(value.trim());
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  return (
    <div className={`cb ${open ? 'open' : ''}`}>
      <div className="cb-in">
        <Icon name="search" />
        <input
          value={value}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={label}
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
          onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 200)}
          onChange={e => {
            onChange(e.target.value);
            setOpen(true);
          }}
          onKeyDown={onKey}
        />
        <button
          type="button"
          className="cb-t"
          tabIndex={-1}
          onMouseDown={e => e.preventDefault()}
          onClick={e => {
            const inp = e.currentTarget.parentElement?.querySelector('input');
            if (open) setOpen(false);
            else {
              inp?.focus();
              setOpen(true);
            }
          }}
          aria-label={label}
        >
          <Icon name="down" />
        </button>
      </div>

      {open && rows.length > 0 && (
        <div className="cb-pop" ref={listRef} role="listbox">
          {rows.map((r, i) => (
            <div
              key={r.k}
              role="option"
              aria-selected={i === hi}
              className={`cb-o ${i === hi ? 'hi' : ''}`}
              onMouseDown={e => {
                e.preventDefault();
                choose(r);
              }}
              onMouseEnter={() => setHi(i)}
            >
              <span>{t(r.label)}</span>
              {r.free && <span className="cb-f-tag">{t('Add new')}</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
