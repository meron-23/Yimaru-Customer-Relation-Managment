import { useState, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';
import {
  toEth,
  fromEth,
  ethMonthDays,
  ETH_MONTHS,
  WEEKDAYS,
  dmy,
  todayIso
} from '../lib/ethiopian-calendar';

interface DateInputProps {
  value?: string; // Gregorian ISO string YYYY-MM-DD
  onChange: (date: string) => void;
  min?: string;
  max?: string;
  placeholder?: string;
  clearable?: boolean;
  compact?: boolean;
  ariaLabel?: string;
}

function addDaysStr(iso: string, n: number): string {
  const d = new Date(iso + 'T00:00:00');
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function DateInput({
  value,
  onChange,
  min,
  max,
  placeholder,
  clearable,
  compact,
  ariaLabel
}: DateInputProps) {
  const { t, i18n } = useTranslation();
  const lang = (i18n.language === 'am' ? 'am' : 'en') as 'en' | 'am';
  const btn = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  const today = todayIso();
  const viewOf = (s: string) => {
    const e = toEth(s) || toEth(today)!;
    return { y: e.y, m: e.m };
  };

  const [view, setView] = useState(() => viewOf(value || today));
  const [focus, setFocus] = useState(value || today);

  function show() {
    setView(viewOf(value || today));
    setFocus(value || today);
    if (!btn.current) return;
    const r = btn.current.getBoundingClientRect();
    const W = 300, H = 352, vw = window.innerWidth, vh = window.innerHeight;
    const left = Math.max(8, Math.min(r.left, vw - W - 8));
    const top =
      r.bottom + 8 + H > vh && r.top - H - 8 > 0
        ? r.top - H - 8
        : Math.min(r.bottom + 8, Math.max(8, vh - H - 8));
    setPos({ left, top });
    setOpen(true);
  }

  const ok = (d: string) => (!min || d >= min) && (!max || d <= max);
  const pickDay = (d: string) => {
    if (!ok(d)) return;
    onChange(d);
    setOpen(false);
    setTimeout(() => btn.current?.focus(), 0);
  };

  const first = fromEth(view.y, view.m, 1);
  const startOffset = (new Date(first + 'T00:00:00').getDay() + 6) % 7;
  const cells = Math.ceil((startOffset + ethMonthDays(view.y, view.m)) / 7) * 7;
  const days = Array.from({ length: cells }, (_, i) => {
    const d = addDaysStr(first, i - startOffset);
    const e = toEth(d);
    return { d, n: e ? e.d : 1, out: !e || e.m !== view.m };
  });

  const weekdays = [1, 2, 3, 4, 5, 6, 0].map(w => {
    const n = WEEKDAYS[lang][w];
    return n.slice(0, 2);
  });

  const monthName = ETH_MONTHS[lang][view.m - 1];
  const title = lang === 'am' ? `${monthName} ${view.y} ዓ.ም.` : `${monthName} ${view.y} E.C.`;

  const move = (n: number) => {
    setView(v => {
      let m = v.m + n, y = v.y;
      if (m < 1) { m = 13; y--; }
      if (m > 13) { m = 1; y++; }
      return { y, m };
    });
  };

  function onKey(e: React.KeyboardEvent) {
    const step = {
      ArrowLeft: -1,
      ArrowRight: 1,
      ArrowUp: -7,
      ArrowDown: 7
    }[e.key];

    if (step) {
      e.preventDefault();
      const nd = addDaysStr(focus, step);
      setFocus(nd);
      setView(viewOf(nd));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      pickDay(focus);
    } else if (e.key === 'Escape') {
      setOpen(false);
      btn.current?.focus();
    }
  }

  return (
    <>
      <button
        type="button"
        ref={btn}
        className={`dinput ${compact ? 'sm' : ''} ${open ? 'on' : ''}`}
        onClick={() => (open ? setOpen(false) : show())}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={ariaLabel}
      >
        <Icon name="cal" />
        <span className={value ? '' : 'ph'}>
          {value ? dmy(value) : placeholder || t('Pick a date')}
        </span>
      </button>

      {open &&
        pos &&
        createPortal(
          <div className={`dp-layer ${lang === 'am' ? 'am' : ''}`}>
            <div className="dp-bg" onClick={() => setOpen(false)} />
            <div
              className="dpop"
              style={{ left: pos.left, top: pos.top }}
              role="dialog"
              aria-label={t('Pick a date')}
              tabIndex={-1}
              onKeyDown={onKey}
              ref={el => {
                if (el && !el.contains(document.activeElement)) el.focus();
              }}
            >
              <div className="dp-h">
                <button
                  type="button"
                  className="dp-nav"
                  onClick={() => move(-1)}
                  aria-label={t('Previous month')}
                >
                  <Icon name="back" />
                </button>
                <b>{title}</b>
                <button
                  type="button"
                  className="dp-nav"
                  onClick={() => move(1)}
                  aria-label={t('Next month')}
                >
                  <Icon name="right" />
                </button>
              </div>

              <div className="dp-w">
                {weekdays.map((w, i) => (
                  <span key={i}>{w}</span>
                ))}
              </div>

              <div className="dp-g">
                {days.map(x => (
                  <button
                    type="button"
                    key={x.d}
                    disabled={!ok(x.d)}
                    onClick={() => pickDay(x.d)}
                    className={`dp-d ${x.out ? 'out' : ''} ${x.d === today ? 'today' : ''} ${
                      x.d === value ? 'sel' : ''
                    } ${x.d === focus ? 'foc' : ''}`}
                  >
                    {x.n}
                  </button>
                ))}
              </div>

              <div className="dp-f">
                <button
                  type="button"
                  className="dp-link"
                  disabled={!ok(today)}
                  onClick={() => pickDay(today)}
                >
                  {t('Today')}
                </button>
                {clearable && value && (
                  <button
                    type="button"
                    className="dp-link mute"
                    onClick={() => {
                      onChange('');
                      setOpen(false);
                    }}
                  >
                    {t('Clear')}
                  </button>
                )}
              </div>
            </div>
          </div>,
          document.body
        )}
    </>
  );
}
