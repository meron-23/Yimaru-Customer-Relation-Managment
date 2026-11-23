import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Icon } from '../components/Icon';
import { Avatar } from '../components/Avatar';
import { ComboBox } from '../components/ComboBox';
import { COUNTRY_NAMES } from '../lib/reference-data';
import type { DestinationPrice, Role } from '../types';

type SettingSection = 'business' | 'packages' | 'countries' | 'followup' | 'team';

const SET_SECTIONS: Array<[SettingSection, string, string]> = [
  ['business', 'Business', 'gear'],
  ['packages', 'Packages', 'tag'],
  ['countries', 'Destination prices', 'globe'],
  ['followup', 'Lead follow-up', 'phone'],
  ['team', 'Team and logins', 'users']
];

const PACKAGES_CONFIG = [
  {
    key: 'p1',
    label: 'Package 1',
    desc: 'Consulting, applying & university admission',
    steps: [
      { label: 'Registration fee', when: 'At registration' },
      { label: 'Payment 1', when: 'After admission' }
    ]
  },
  {
    key: 'p2',
    label: 'Package 2',
    desc: 'Full journey through visa completion',
    steps: [
      { label: 'Registration fee', when: 'At registration' },
      { label: 'Payment 1', when: 'After admission' },
      { label: 'Payment 2', when: 'After visa granted' }
    ]
  }
];

function randomPw() {
  return `Yimaru-${Math.floor(1000 + Math.random() * 9000)}`;
}

export default function Settings() {
  const { t } = useTranslation();
  const { currentUser, isPartner, users, addUser, updateUserRole, toggleUserActive, removeUser } = useAuth();
  const { settings, updateSettings, destinationPrices, updateDestinationPrices, addToast } = useData();

  const [sec, setSec] = useState<SettingSection>('business');

  // Form states for settings
  const [businessName, setBusinessName] = useState(settings.business_name || 'Yimaru Consulting');
  const [currency, setCurrency] = useState(settings.currency || 'ETB');
  const [p1Reg, setP1Reg] = useState(settings.p1_registration || 10000);
  const [p1Tot, setP1Tot] = useState(settings.p1_total || 160000);
  const [p2Reg, setP2Reg] = useState(settings.p2_registration || 10000);
  const [p2Tot, setP2Tot] = useState(settings.p2_total || 310000);
  const [cadence, setCadence] = useState<number[]>(settings.cadence || [0, 1, 3, 7, 14]);

  // Destination prices state
  const [destList, setDestList] = useState<DestinationPrice[]>(destinationPrices);
  const [addingCountry, setAddingCountry] = useState(false);
  const [customCountry, setCustomCountry] = useState('');
  const [countryErr, setCountryErr] = useState('');
  const [showAllCountries, setShowAllCountries] = useState(false);

  // Team state
  const [revealPw, setRevealPw] = useState<Record<string, boolean>>({});
  const [confirmRemoveUser, setConfirmRemoveUser] = useState<string | null>(null);
  const [newUser, setNewUser] = useState({
    fullName: '',
    username: '',
    role: 'staff' as Role,
    password: randomPw()
  });
  const [newUserErr, setNewUserErr] = useState('');

  // Sync from context when settings change
  useEffect(() => {
    setBusinessName(settings.business_name || 'Yimaru Consulting');
    setCurrency(settings.currency || 'ETB');
    setP1Reg(settings.p1_registration || 10000);
    setP1Tot(settings.p1_total || 160000);
    setP2Reg(settings.p2_registration || 10000);
    setP2Tot(settings.p2_total || 310000);
    setCadence(settings.cadence || [0, 1, 3, 7, 14]);
  }, [settings]);

  useEffect(() => {
    setDestList(destinationPrices);
  }, [destinationPrices]);

  // Dirty check
  const isDirty =
    businessName !== (settings.business_name || 'Yimaru Consulting') ||
    currency !== (settings.currency || 'ETB') ||
    p1Reg !== (settings.p1_registration || 10000) ||
    p1Tot !== (settings.p1_total || 160000) ||
    p2Reg !== (settings.p2_registration || 10000) ||
    p2Tot !== (settings.p2_total || 310000) ||
    JSON.stringify(cadence) !== JSON.stringify(settings.cadence || [0, 1, 3, 7, 14]) ||
    JSON.stringify(destList) !== JSON.stringify(destinationPrices);

  const handleSave = () => {
    const sortedCadence = [...cadence].sort((a, b) => a - b);
    updateSettings({
      business_name: businessName.trim(),
      currency: currency.trim() || 'ETB',
      p1_registration: Number(p1Reg) || 0,
      p1_total: Number(p1Tot) || 0,
      p2_registration: Number(p2Reg) || 0,
      p2_total: Number(p2Tot) || 0,
      cadence: sortedCadence
    });
    updateDestinationPrices(destList);
    addToast(t('Settings saved'), 'success');
  };

  // Destination actions
  const handleAddCountry = (picked?: string) => {
    const name = String(picked || customCountry).trim().replace(/\s+/g, ' ');
    if (!name) return;
    if (destList.some(x => x.country.toLowerCase() === name.toLowerCase())) {
      setCountryErr(t('{c} is already in the list.', { c: name }));
      return;
    }
    const newEntry: DestinationPrice = {
      id: `dp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      country: name,
      payment1: 150000,
      payment2: 150000,
      sort_order: destList.length + 1
    };
    setDestList(prev => [...prev, newEntry]);
    setCustomCountry('');
    setAddingCountry(false);
    setCountryErr('');
    if (destList.length + 1 > 6) setShowAllCountries(true);
  };

  const handleUpdateDestPrice = (id: string, key: 'payment1' | 'payment2', val: string) => {
    const num = Math.max(0, parseInt(val.replace(/\D/g, '') || '0', 10));
    setDestList(prev => prev.map(d => (d.id === id ? { ...d, [key]: num } : d)));
  };

  const handleRemoveDest = (id: string) => {
    setDestList(prev => prev.filter(d => d.id !== id));
  };

  // Team actions
  const handleCreateUser = () => {
    const uName = newUser.username.trim().toLowerCase().replace(/\s+/g, '');
    if (!newUser.fullName.trim()) {
      setNewUserErr(t('Add the person’s full name.'));
      return;
    }
    if (!uName) {
      setNewUserErr(t('Add a username.'));
      return;
    }
    if (users.some(u => u.username.toLowerCase() === uName)) {
      setNewUserErr(t('The username “{u}” is already taken.', { u: uName }));
      return;
    }
    const res = addUser(newUser.fullName.trim(), uName, newUser.role, newUser.password);
    if (!res.success) {
      setNewUserErr(res.error || t('Could not create user.'));
      return;
    }
    addToast(t('{n} can sign in', { n: newUser.fullName.trim() }), 'success');
    setNewUser({
      fullName: '',
      username: '',
      role: 'staff',
      password: randomPw()
    });
    setNewUserErr('');
  };

  if (!isPartner) {
    return (
      <div className="pg">
        <header className="page-head">
          <h1 className="page-head-t">{t('Settings')}</h1>
        </header>
        <div className="empty-s" style={{ padding: 48, textAlign: 'center' }}>
          <Icon name="lock" size={32} />
          <h2 style={{ margin: '16px 0 8px' }}>{t('Partners only')}</h2>
          <p style={{ color: 'var(--ink3)', maxWidth: 460, margin: '0 auto' }}>
            {t('Settings are for partners only. Log in as a partner to change prices, logins or lead follow-up.')}
          </p>
        </div>
      </div>
    );
  }

  const shownDest = showAllCountries ? destList : destList.slice(0, 6);

  return (
    <div className="pg">
      <header className="page-head">
        <div>
          <h1 className="page-head-t">{t('Settings')}</h1>
          <p className="page-head-s">{t('Partners only. Prices, logins and how leads are followed up.')}</p>
        </div>
        {sec !== 'team' && (
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            {isDirty && <span className="unsaved">{t('Unsaved changes')}</span>}
            <button className="btn primary" disabled={!isDirty} onClick={handleSave}>
              <Icon name="check" />
              {t('Save changes')}
            </button>
          </div>
        )}
      </header>

      <div className="set">
        {/* Left Navigation */}
        <nav className="set-nav">
          {SET_SECTIONS.map(([k, label, iconName]) => (
            <button
              key={k}
              type="button"
              className={sec === k ? 'on' : ''}
              onClick={() => setSec(k)}
            >
              <Icon name={iconName} />
              <span>{t(label)}</span>
            </button>
          ))}
        </nav>

        {/* Section Pane */}
        <div className="set-pane">
          {/* 1. BUSINESS */}
          {sec === 'business' && (
            <section className="sp">
              <h2>{t('Business')}</h2>
              <p className="sp-sub">{t('Shown on the CRM and used for amounts.')}</p>
              <div className="grid2">
                <label className="field">
                  <span className="field-l">{t('Business name')}</span>
                  <input
                    className="inp"
                    value={businessName}
                    onChange={e => setBusinessName(e.target.value)}
                  />
                </label>
                <label className="field">
                  <span className="field-l">{t('Currency')}</span>
                  <input
                    className="inp"
                    value={currency}
                    onChange={e => setCurrency(e.target.value)}
                    placeholder="ETB"
                  />
                </label>
              </div>
            </section>
          )}

          {/* 2. PACKAGES */}
          {sec === 'packages' && (
            <section className="sp">
              <h2>{t('Packages')}</h2>
              <p className="sp-sub">
                {t('Both packages start with a non-refundable registration fee. Payment 1 and Payment 2 are set per destination.')}
              </p>
              <div className="pkgs">
                {PACKAGES_CONFIG.map(pkg => (
                  <div key={pkg.key} className={`pkg pkg-${pkg.key}`}>
                    <div className="pkg-h">
                      <h3>{t(pkg.label)}</h3>
                      <span>{t('{n} payments', { n: pkg.steps.length })}</span>
                    </div>
                    <p>{t(pkg.desc)}</p>
                    <ol className="pkg-steps">
                      {pkg.steps.map(step => (
                        <li key={step.label}>
                          {t(step.label)}
                          <span>{t(step.when)}</span>
                        </li>
                      ))}
                    </ol>
                    <div className="grid2">
                      <label className="field">
                        <span className="field-l">{t('Registration fee ({c})', { c: currency })}</span>
                        <input
                          className="inp num"
                          inputMode="numeric"
                          value={pkg.key === 'p1' ? p1Reg.toLocaleString() : p2Reg.toLocaleString()}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10));
                            if (pkg.key === 'p1') setP1Reg(val);
                            else setP2Reg(val);
                          }}
                          placeholder="10,000"
                        />
                      </label>
                      <label className="field">
                        <span className="field-l">{t('Package total ({c})', { c: currency })}</span>
                        <input
                          className="inp num"
                          inputMode="numeric"
                          value={pkg.key === 'p1' ? p1Tot.toLocaleString() : p2Tot.toLocaleString()}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10));
                            if (pkg.key === 'p1') setP1Tot(val);
                            else setP2Tot(val);
                          }}
                        />
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* 3. DESTINATION PRICES */}
          {sec === 'countries' && (
            <section className="sp">
              <div className="sp-h">
                <div>
                  <h2>{t('Destination prices')}</h2>
                  <p className="sp-sub">
                    {t('What a student pays per destination. These fill in automatically on each student’s payments.')}
                  </p>
                </div>
                {!addingCountry && (
                  <button className="btn" onClick={() => setAddingCountry(true)}>
                    <Icon name="plus" />
                    {t('Add a country')}
                  </button>
                )}
              </div>

              {addingCountry && (
                <div className="addc">
                  <div className="field">
                    <span className="field-l">{t('Country')}</span>
                    <span className="field-h">{t('Type any country. Suggestions appear as you type.')}</span>
                    <ComboBox
                      value={customCountry}
                      autoFocus
                      label={t('Country')}
                      placeholder={t('e.g. Slovakia')}
                      options={COUNTRY_NAMES}
                      exclude={destList.map(x => x.country)}
                      onChange={v => {
                        setCustomCountry(v);
                        setCountryErr('');
                      }}
                      onPick={v => handleAddCountry(v)}
                    />
                  </div>
                  <div className="row-btn" style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                    <button
                      className="btn"
                      onClick={() => {
                        setAddingCountry(false);
                        setCustomCountry('');
                        setCountryErr('');
                      }}
                    >
                      {t('Cancel')}
                    </button>
                    <button
                      className="btn primary"
                      disabled={!customCountry.trim()}
                      onClick={() => handleAddCountry()}
                    >
                      <Icon name="plus" />
                      {t('Add')}
                    </button>
                  </div>
                  {countryErr && (
                    <p className="formerr" style={{ color: 'var(--red)', marginTop: 8 }}>
                      <Icon name="alert" />
                      {countryErr}
                    </p>
                  )}
                </div>
              )}

              <div className="ctl">
                <div className="ctl-h">
                  <span>{t('Destination')}</span>
                  <span>{t('Payment 1, after admission')}</span>
                  <span>{t('Payment 2, after visa')}</span>
                  <span>{t('Total')}</span>
                  <span />
                </div>
                {shownDest.map(c => {
                  const total = (Number(c.payment1) || 0) + (Number(c.payment2) || 0);
                  return (
                    <div key={c.id} className="ctl-r">
                      <span className="ctl-n">
                        <Icon name="globe" />
                        <b>{t(c.country)}</b>
                      </span>
                      <label className="ctl-f">
                        <em>{t('Payment 1')}</em>
                        <input
                          className="inp num"
                          inputMode="numeric"
                          value={(c.payment1 || 0).toLocaleString()}
                          placeholder={t('Set price')}
                          onChange={e => handleUpdateDestPrice(c.id, 'payment1', e.target.value)}
                          aria-label={`${c.country} payment 1`}
                        />
                      </label>
                      <label className="ctl-f">
                        <em>{t('Payment 2')}</em>
                        <input
                          className="inp num"
                          inputMode="numeric"
                          value={(c.payment2 || 0).toLocaleString()}
                          placeholder={t('Set price')}
                          onChange={e => handleUpdateDestPrice(c.id, 'payment2', e.target.value)}
                          aria-label={`${c.country} payment 2`}
                        />
                      </label>
                      <span className="ctl-t">
                        {total.toLocaleString()} {currency}
                      </span>
                      <button
                        className="ib"
                        aria-label={t('Remove {c}', { c: c.country })}
                        onClick={() => handleRemoveDest(c.id)}
                      >
                        <Icon name="trash" />
                      </button>
                    </div>
                  );
                })}
                {destList.length === 0 && (
                  <p className="blk-empty">{t('No destinations yet. Add the countries you send students to.')}</p>
                )}
              </div>

              {destList.length > 6 && (
                <button className="more" onClick={() => setShowAllCountries(v => !v)}>
                  {showAllCountries ? t('Show fewer') : t('Show all {n}', { n: destList.length })}
                </button>
              )}
            </section>
          )}

          {/* 4. LEAD FOLLOW-UP */}
          {sec === 'followup' && (
            <section className="sp">
              <h2>{t('Lead follow-up')}</h2>
              <p className="sp-sub">
                {t('When each call is due, counted in days from the enquiry. If nobody answers the last call, the lead closes as “No response”.')}
              </p>
              <div className="flow">
                {cadence.map((d, i) => (
                  <div key={i} className="flow-n">
                    <span className="flow-dot">{i + 1}</span>
                    <span className="flow-l">{t('Call {n}', { n: i + 1 })}</span>
                    {i === 0 ? (
                      <span className="flow-d same">{t('Same day')}</span>
                    ) : (
                      <label className="flow-d">
                        {t('Day')}{' '}
                        <input
                          inputMode="numeric"
                          value={d}
                          onChange={e => {
                            const val = Math.max(0, parseInt(e.target.value.replace(/\D/g, '') || '0', 10));
                            setCadence(prev => prev.map((x, j) => (j === i ? val : x)));
                          }}
                        />
                      </label>
                    )}
                    {i > 0 && cadence.length > 2 && (
                      <button
                        className="flow-x"
                        aria-label={t('Remove call {n}', { n: i + 1 })}
                        onClick={() => setCadence(prev => prev.filter((_, j) => j !== i))}
                      >
                        <Icon name="close" />
                      </button>
                    )}
                  </div>
                ))}

                <button
                  className="flow-add"
                  type="button"
                  onClick={() => setCadence(prev => [...prev, (prev[prev.length - 1] || 0) + 7])}
                >
                  <Icon name="plus" />
                  {t('Add a call')}
                </button>

                <div className="flow-n end">
                  <span className="flow-dot x">
                    <Icon name="close" />
                  </span>
                  <span className="flow-l">{t('Closed')}</span>
                  <span className="flow-d same">{t('No response')}</span>
                </div>
              </div>

              <p className="muted small" style={{ marginTop: 16 }}>
                {t('Calls on day {d}. Save changes to apply the new plan to open leads.', {
                  d: [...cadence].sort((a, b) => a - b).join(', ')
                })}
              </p>
            </section>
          )}

          {/* 5. TEAM AND LOGINS */}
          {sec === 'team' && (
            <section className="sp">
              <h2>{t('Team and logins')}</h2>
              <p className="sp-sub">
                {t('Everyone gets their own username and password. Partners can open Settings; staff work leads and cases. Changes here save straight away.')}
              </p>

              <div className="usr">
                {users.map(u => (
                  <div key={u.id} className="usr-r">
                    <span className="c-who">
                      <Avatar name={u.full_name} size={36} />
                      <span className="who-t">
                        <b>
                          {u.full_name}
                          {u.id === currentUser?.id ? ` ${t('(you)')}` : ''}
                        </b>
                        <i>@{u.username}</i>
                      </span>
                    </span>

                    <span className="usr-pw">
                      <code className="pwc">
                        {revealPw[u.id] ? u.password_hash || '••••••••' : '••••••••'}
                      </code>
                      <button
                        className="linkbtn"
                        onClick={() => setRevealPw(prev => ({ ...prev, [u.id]: !prev[u.id] }))}
                      >
                        {revealPw[u.id] ? t('Hide') : t('Show')}
                      </button>
                    </span>

                    <select
                      className="inp"
                      value={u.role}
                      disabled={u.id === currentUser?.id}
                      onChange={e => {
                        updateUserRole(u.id, e.target.value as Role);
                        addToast(
                          t('{n} is now {r}', {
                            n: u.full_name,
                            r: t(e.target.value === 'partner' ? 'Partner' : 'Staff')
                          }),
                          'info'
                        );
                      }}
                    >
                      <option value="partner">{t('Partner')}</option>
                      <option value="staff">{t('Staff')}</option>
                    </select>

                    <span className="usr-sw">
                      <button
                        className={`switch ${u.active ? 'on' : ''}`}
                        disabled={u.id === currentUser?.id}
                        role="switch"
                        aria-checked={u.active}
                        onClick={() => {
                          toggleUserActive(u.id);
                          addToast(
                            u.active
                              ? t('{n} can no longer sign in', { n: u.full_name })
                              : t('{n} can sign in', { n: u.full_name }),
                            'info'
                          );
                        }}
                      >
                        <span />
                      </button>
                      <em>{u.active ? t('Can sign in') : t('Blocked')}</em>
                    </span>

                    <span className="usr-x">
                      {u.id !== currentUser?.id && (
                        confirmRemoveUser === u.id ? (
                          <span className="dz-c inline" style={{ display: 'inline-flex', gap: 6 }}>
                            <button
                              className="btn sm"
                              onClick={() => setConfirmRemoveUser(null)}
                            >
                              {t('Keep')}
                            </button>
                            <button
                              className="btn sm danger"
                              onClick={() => {
                                const res = removeUser(u.id);
                                if (!res.success) {
                                  addToast(res.error || t('Could not remove user.'), 'error');
                                } else {
                                  addToast(t('User removed.'), 'info');
                                }
                                setConfirmRemoveUser(null);
                              }}
                            >
                              {t('Remove')}
                            </button>
                          </span>
                        ) : (
                          <button
                            className="ib"
                            aria-label={t('Remove {c}', { c: u.full_name })}
                            onClick={() => setConfirmRemoveUser(u.id)}
                          >
                            <Icon name="trash" />
                          </button>
                        )
                      )}
                    </span>
                  </div>
                ))}
              </div>

              {/* Create Login */}
              <div className="newlogin" style={{ marginTop: 32 }}>
                <h3>{t('Create a login')}</h3>
                <div className="nl-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, alignItems: 'end' }}>
                  <label className="field">
                    <span className="field-l">{t('Full name')}</span>
                    <input
                      className="inp"
                      value={newUser.fullName}
                      onChange={e => {
                        const name = e.target.value;
                        const guessed = (name.split(' ')[0] || '').toLowerCase();
                        setNewUser(prev => ({
                          ...prev,
                          fullName: name,
                          username: prev.username || guessed
                        }));
                        setNewUserErr('');
                      }}
                      placeholder="Hana Bekele"
                    />
                  </label>

                  <label className="field">
                    <span className="field-l">{t('Username')}</span>
                    <input
                      className="inp"
                      value={newUser.username}
                      autoCapitalize="none"
                      onChange={e => {
                        setNewUser(prev => ({ ...prev, username: e.target.value }));
                        setNewUserErr('');
                      }}
                      placeholder="hana"
                    />
                  </label>

                  <label className="field">
                    <span className="field-l">{t('Role')}</span>
                    <select
                      className="inp"
                      value={newUser.role}
                      onChange={e => setNewUser(prev => ({ ...prev, role: e.target.value as Role }))}
                    >
                      <option value="staff">{t('Staff')}</option>
                      <option value="partner">{t('Partner')}</option>
                    </select>
                  </label>

                  <label className="field">
                    <span className="field-l">{t('Password')}</span>
                    <span className="pwbox" style={{ display: 'flex', gap: 6 }}>
                      <input
                        className="inp"
                        value={newUser.password}
                        onChange={e => setNewUser(prev => ({ ...prev, password: e.target.value }))}
                      />
                      <button
                        type="button"
                        className="ib"
                        title={t('Generate a new password')}
                        aria-label={t('Generate a new password')}
                        onClick={() => setNewUser(prev => ({ ...prev, password: randomPw() }))}
                      >
                        <Icon name="refresh" />
                      </button>
                    </span>
                  </label>

                  <button className="btn primary" onClick={handleCreateUser} style={{ height: 42 }}>
                    <Icon name="plus" />
                    {t('Create login')}
                  </button>
                </div>

                {newUserErr && (
                  <p className="formerr" style={{ color: 'var(--red)', marginTop: 8 }}>
                    <Icon name="alert" />
                    {newUserErr}
                  </p>
                )}

                <p className="muted small" style={{ marginTop: 8 }}>
                  {t('Share the username and password with the person directly. You can show it again here any time.')}
                </p>
              </div>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
