import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

/**
 * Login screen — spec §3
 * Username + password, EN/አማ switch, Enter submits.
 */
export default function Login() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  function toggleLang() {
    const next = i18n.language === 'en' ? 'am' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('yim:lang', next);
  }

  async function handleSignIn() {
    setError('');
    setLoading(true);
    try {
      // TODO: wire to Supabase Auth
      // const { error } = await supabase.auth.signInWithPassword({ email, password });
      // For now just navigate (placeholder)
      if (!username.trim() || !password.trim()) {
        setError(t("That username and password don't match an active login. Check both and try again."));
        return;
      }
      navigate('/home');
    } finally {
      setLoading(false);
    }
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSignIn();
  }

  return (
    <div className="login-page">
      <div className="login-card">
        {/* Brand bar */}
        <div className="login-brandbar" />
        {/* Logo */}
        <div className="login-logo">
          <h1 className="login-title">Yimaru Consulting</h1>
          <p className="login-sub">Study Abroad CRM</p>
        </div>
        {/* Lang toggle */}
        <div className="login-lang">
          <button className="lang-toggle" onClick={toggleLang}>
            {i18n.language === 'en' ? 'EN / አማ' : 'አማ / EN'}
          </button>
        </div>
        {/* Form */}
        <div className="login-form">
          <label className="field">
            <span className="field-lbl">Username</span>
            <input
              type="text"
              className="input"
              value={username}
              onChange={e => setUsername(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="username"
              autoFocus
            />
          </label>
          <label className="field">
            <span className="field-lbl">Password</span>
            <input
              type="password"
              className="input"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={handleKey}
              autoComplete="current-password"
            />
          </label>
          {error && <p className="login-error">{error}</p>}
          <button className="btn btn-primary login-btn" onClick={handleSignIn} disabled={loading}>
            {loading ? '…' : t('Sign in')}
          </button>
          <p className="login-help">
            {t("Forgot your password? Ask a partner to reset it in Settings.")}
          </p>
        </div>
      </div>
    </div>
  );
}
