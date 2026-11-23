import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useData } from '../context/DataContext';
import { Icon } from './Icon';
import { StatusPill } from './Pill';

export function GlobalSearch({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { students, leads } = useData();
  const [query, setQuery] = useState('');
  const [selIndex, setSelIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelIndex(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  const q = query.trim().toLowerCase();

  const matchedStudents = q
    ? students
        .filter(s => !s.deleted_at)
        .filter(
          s =>
            s.full_name.toLowerCase().includes(q) ||
            s.case_id.toLowerCase().includes(q) ||
            (s.phone && s.phone.includes(q)) ||
            (s.strategy_country && s.strategy_country.toLowerCase().includes(q))
        )
        .slice(0, 5)
    : [];

  const matchedLeads = q
    ? leads
        .filter(l => !l.deleted_at)
        .filter(
          l =>
            (l.name && l.name.toLowerCase().includes(q)) ||
            l.code.toLowerCase().includes(q) ||
            (l.phone && l.phone.includes(q)) ||
            (l.interest_country && l.interest_country.toLowerCase().includes(q))
        )
        .slice(0, 5)
    : [];

  const allResults = [
    ...matchedStudents.map(s => ({ type: 'student' as const, id: s.id, item: s })),
    ...matchedLeads.map(l => ({ type: 'lead' as const, id: l.id, item: l }))
  ];

  function handleSelect(item: { type: 'student' | 'lead'; id: string }) {
    onClose();
    if (item.type === 'student') {
      navigate(`/students/${item.id}`);
    } else {
      navigate(`/leads?id=${item.id}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') {
      onClose();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelIndex(i => Math.min(i + 1, Math.max(0, allResults.length - 1)));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelIndex(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (allResults[selIndex]) {
        handleSelect(allResults[selIndex]);
      }
    }
  }

  if (!open) return null;

  return (
    <div className="search-modal-backdrop" onClick={onClose}>
      <div className="search-modal" onClick={e => e.stopPropagation()} onKeyDown={handleKeyDown}>
        <div className="search-modal-header">
          <Icon name="search" />
          <input
            ref={inputRef}
            type="text"
            className="search-modal-input"
            placeholder={t('Search students, leads, phones, case IDs…')}
            value={query}
            onChange={e => {
              setQuery(e.target.value);
              setSelIndex(0);
            }}
          />
          <kbd className="search-modal-kbd">ESC</kbd>
        </div>

        {allResults.length > 0 ? (
          <div className="search-modal-results">
            {matchedStudents.length > 0 && (
              <div className="search-section">
                <div className="search-section-title">{t('Students')}</div>
                {matchedStudents.map(s => (
                  <div
                    key={s.id}
                    className="search-item"
                    onClick={() => handleSelect({ type: 'student', id: s.id })}
                  >
                    <div className="search-item-main">
                      <span className="search-item-name">{s.full_name}</span>
                      <span className="search-item-id">{s.case_id}</span>
                      {s.strategy_country && (
                        <span className="search-item-sub">({s.strategy_country})</span>
                      )}
                    </div>
                    <StatusPill student={s} />
                  </div>
                ))}
              </div>
            )}

            {matchedLeads.length > 0 && (
              <div className="search-section">
                <div className="search-section-title">{t('Leads')}</div>
                {matchedLeads.map(l => (
                  <div
                    key={l.id}
                    className="search-item"
                    onClick={() => handleSelect({ type: 'lead', id: l.id })}
                  >
                    <div className="search-item-main">
                      <span className="search-item-name">{l.name || 'Untitled Lead'}</span>
                      <span className="search-item-id">{l.code}</span>
                      {l.phone && <span className="search-item-sub">{l.phone}</span>}
                    </div>
                    <span className={`pill pl-${l.status === 'converted' ? 'teal' : l.status === 'closed' ? 'grey' : 'amber'}`}>
                      {t(l.status === 'converted' ? 'Registered' : l.status === 'closed' ? 'Closed' : 'Open')}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : query ? (
          <div className="search-empty">{t('No results found')}</div>
        ) : (
          <div className="search-hint">{t('Type to search across all student cases and enquiry leads…')}</div>
        )}
      </div>
    </div>
  );
}
