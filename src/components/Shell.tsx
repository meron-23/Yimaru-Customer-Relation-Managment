import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '../context/AuthContext';
import { useData } from '../context/DataContext';
import { Icon } from './Icon';
import { Avatar } from './Avatar';
import { ToastContainer } from './ToastContainer';
import { GlobalSearch } from './GlobalSearch';
import { todayIso } from '../lib/ethiopian-calendar';
import { leadBucket } from '../lib/leads';

export default function Shell() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { currentUser, signOut, isPartner } = useAuth();
  const { students, leads } = useData();

  const [searchOpen, setSearchOpen] = useState(false);

  // If user is not logged in, redirect to login
  useEffect(() => {
    if (!currentUser) {
      navigate('/login');
    }
  }, [currentUser, navigate]);

  // Global Ctrl+K shortcut
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchOpen(prev => !prev);
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  function toggleLang() {
    const next = i18n.language === 'en' ? 'am' : 'en';
    i18n.changeLanguage(next);
    localStorage.setItem('yim:lang', next);
    document.documentElement.lang = next;
  }

  // Calculate live badge counts (spec §6.1)
  const today = todayIso();
  const overdueOrTodayLeadsCount = leads.filter(l => {
    if (l.deleted_at || l.status === 'closed' || l.status === 'converted') return false;
    const b = leadBucket(l, today);
    return b === 'today' || b === 'overdue' || b === 'uncalled';
  }).length;

  const activeStudentsCount = students.filter(s => !s.deleted_at && !s.archived).length;

  return (
    <div className={`app ${i18n.language === 'am' ? 'am' : ''}`}>
      {/* Desktop Sidebar */}
      <aside className="side" aria-label="Main navigation">
        <div className="brandbar" />

        {/* Logo */}
        <div className="logo-row">
          <img src="/yimaru-logo-full.png" alt="Yimaru Consulting" className="logo-img" />
        </div>

        {/* Search button with Ctrl K */}
        <button
          type="button"
          className="search-btn"
          onClick={() => setSearchOpen(true)}
          aria-label={t('Search')}
        >
          <Icon name="search" size={16} />
          <span className="search-lbl">{t('Search…')}</span>
          <kbd>Ctrl K</kbd>
        </button>

        {/* Nav Links */}
        <nav className="nav">
          <NavLink
            to="/home"
            className={({ isActive }) => `nav-a ${isActive ? 'active' : ''}`}
          >
            <Icon name="dash" />
            <span>{t('Home')}</span>
          </NavLink>

          <NavLink
            to="/leads"
            className={({ isActive }) => `nav-a ${isActive ? 'active' : ''}`}
          >
            <Icon name="phone" />
            <span>{t('Leads')}</span>
            {overdueOrTodayLeadsCount > 0 && (
              <span className="nav-badge yellow">{overdueOrTodayLeadsCount}</span>
            )}
          </NavLink>

          <NavLink
            to="/students"
            className={({ isActive }) => `nav-a ${isActive ? 'active' : ''}`}
          >
            <Icon name="users" />
            <span>{t('Students')}</span>
            <span className="nav-badge grey">{activeStudentsCount}</span>
          </NavLink>

          <NavLink
            to="/reports"
            className={({ isActive }) => `nav-a ${isActive ? 'active' : ''}`}
          >
            <Icon name="chart" />
            <span>{t('Reports')}</span>
          </NavLink>

          {isPartner && (
            <NavLink
              to="/settings"
              className={({ isActive }) => `nav-a ${isActive ? 'active' : ''}`}
            >
              <Icon name="gear" />
              <span>{t('Settings')}</span>
            </NavLink>
          )}
        </nav>

        {/* Primary Action Buttons */}
        <div className="side-actions">
          <button
            type="button"
            className="btn btn-yellow"
            onClick={() => navigate('/students/new')}
          >
            <Icon name="plus" />
            <span>{t('New case')}</span>
          </button>
          <button
            type="button"
            className="btn btn-side-outline"
            onClick={() => navigate('/leads?new=1')}
          >
            <Icon name="plus" />
            <span>{t('New lead')}</span>
          </button>
        </div>

        <div className="side-space" />

        {/* Language switch & signed-in user */}
        <div className="side-foot">
          <button type="button" className="lang-btn" onClick={toggleLang}>
            <Icon name="globe" size={15} />
            <span>{i18n.language === 'en' ? 'አማርኛ' : 'English'}</span>
          </button>

          {currentUser && (
            <div className="user-bar">
              <Avatar name={currentUser.full_name} size={32} />
              <div className="user-meta">
                <span className="user-name">{currentUser.full_name}</span>
                <span className="user-role">{t(currentUser.role === 'partner' ? 'Partner' : 'Staff')}</span>
              </div>
              <button
                type="button"
                className="user-logout"
                onClick={signOut}
                title={t('Sign out')}
                aria-label={t('Sign out')}
              >
                <Icon name="logout" size={16} />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="content">
        <Outlet />
      </main>

      {/* Phone Bottom Navigation Bar */}
      <nav className="mob-bar" aria-label="Mobile navigation">
        <NavLink to="/home" className={({ isActive }) => `mob-a ${isActive ? 'active' : ''}`}>
          <Icon name="dash" />
          <span>{t('Home')}</span>
        </NavLink>

        <NavLink to="/leads" className={({ isActive }) => `mob-a ${isActive ? 'active' : ''}`}>
          <Icon name="phone" />
          <span>{t('Leads')}</span>
          {overdueOrTodayLeadsCount > 0 && <span className="mob-dot" />}
        </NavLink>

        <button
          type="button"
          className="mob-new-btn"
          onClick={() => navigate('/students/new')}
          aria-label={t('New')}
        >
          <Icon name="plus" />
        </button>

        <NavLink to="/students" className={({ isActive }) => `mob-a ${isActive ? 'active' : ''}`}>
          <Icon name="users" />
          <span>{t('Students')}</span>
        </NavLink>

        {isPartner ? (
          <NavLink to="/settings" className={({ isActive }) => `mob-a ${isActive ? 'active' : ''}`}>
            <Icon name="gear" />
            <span>{t('Settings')}</span>
          </NavLink>
        ) : (
          <NavLink to="/reports" className={({ isActive }) => `mob-a ${isActive ? 'active' : ''}`}>
            <Icon name="chart" />
            <span>{t('Reports')}</span>
          </NavLink>
        )}
      </nav>

      <GlobalSearch open={searchOpen} onClose={() => setSearchOpen(false)} />
      <ToastContainer />
    </div>
  );
}
