import React from 'react';
import { Routes, Route, Navigate, Link, NavLink, useLocation, useNavigate } from 'react-router-dom';

import { LoginPage } from './pages/LoginPage.jsx';
import { RegisterPage } from './pages/RegisterPage.jsx';
import { HomePage } from './pages/HomePage.jsx';
import { OnboardingPage } from './pages/OnboardingPage.jsx';
import { ProfilePage } from './pages/ProfilePage.jsx';
import { DetailPage } from './pages/DetailPage.jsx';
import { CollectionsPage } from './pages/CollectionsPage.jsx';
import { LandingPage } from './pages/LandingPage.jsx';
import { SearchPage } from './pages/SearchPage.jsx';
import { SettingsPage } from './pages/SettingsPage.jsx';
import { WatchlistPage } from './pages/WatchlistPage.jsx';
import { api, clearAuth, getStoredAuthToken, setAuthToken } from './lib/api.js';

export default function App() {
  const location = useLocation();
  const navigate = useNavigate();
  const token = getStoredAuthToken();
  const authed = Boolean(token);
  const [onboardingCompleted, setOnboardingCompleted] = React.useState(null);
  const [user, setUser] = React.useState(null);
  const [searchInput, setSearchInput] = React.useState('');
  const [searchQuery, setSearchQuery] = React.useState('');

  const searchQFromUrl = React.useMemo(() => {
    const sp = new URLSearchParams(location.search);
    return sp.get('q') ?? '';
  }, [location.search]);

  const getInitialTheme = React.useCallback(() => {
    const saved = localStorage.getItem('theme');
    if (saved === 'light' || saved === 'dark') return saved;
    const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)')?.matches;
    return prefersDark ? 'dark' : 'light';
  }, []);
  const [theme, setTheme] = React.useState(getInitialTheme);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem('theme', theme);
  }, [theme]);

  React.useEffect(() => {
    function onThemeSet(e) {
      const next = e?.detail;
      if (next !== 'light' && next !== 'dark') return;
      setTheme(next);
    }
    window.addEventListener('emz:theme', onThemeSet);
    return () => window.removeEventListener('emz:theme', onThemeSet);
  }, []);

  const toggleTheme = React.useCallback(() => {
    const root = document.documentElement;
    root.setAttribute('data-theme-transition', '1');
    window.setTimeout(() => root.removeAttribute('data-theme-transition'), 520);
    setTheme((t) => (t === 'dark' ? 'light' : 'dark'));
  }, []);

  const themeIcon = theme === 'dark' ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M12 3v2m0 14v2m9-9h-2M5 12H3m15.364-6.364-1.414 1.414M7.05 16.95l-1.414 1.414m12.728 0-1.414-1.414M7.05 7.05 5.636 5.636"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <path
        d="M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10Z"
        stroke="currentColor"
        strokeWidth="2"
      />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path
        d="M21 13.2A7.7 7.7 0 0 1 10.8 3a7.2 7.2 0 1 0 10.2 10.2Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
    </svg>
  );

  React.useEffect(() => {
    if (!token) {
      setOnboardingCompleted(null);
      setUser(null);
      return;
    }

    setAuthToken(token);
    let mounted = true;
    (async () => {
      try {
        const { data } = await api.get('/api/users/me');
        setUser(data?.user ?? null);
        const completedAt = data?.user?.onboarding?.completedAt;
        if (mounted) setOnboardingCompleted(Boolean(completedAt));
      } catch (err) {
        if (!mounted) return;
        setUser(null);
        setOnboardingCompleted(null);
        if (err?.response?.status === 401) {
          clearAuth({ redirectToLogin: true });
        }
      }
    })();

    return () => {
      mounted = false;
    };
  }, [token]);

  React.useEffect(() => {
    function onUserUpdate(e) {
      const next = e?.detail;
      if (!next?.name && !next?.email) return;
      setUser((prev) => ({ ...(prev ?? {}), ...next }));
    }
    window.addEventListener('emz:user', onUserUpdate);
    return () => window.removeEventListener('emz:user', onUserUpdate);
  }, []);

  React.useEffect(() => {
    const t = window.setTimeout(() => {
      setSearchQuery(searchInput);
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  React.useEffect(() => {
    const q = (searchQuery ?? '').trim();
    if (!q) return;
    if (!authed || onboardingCompleted === false) return;
    if (location.pathname !== '/search') {
      navigate(`/search?q=${encodeURIComponent(q)}`, { replace: false });
    }
  }, [authed, location.pathname, navigate, onboardingCompleted, searchQuery]);

  const clearSearch = React.useCallback(() => {
    setSearchInput('');
    setSearchQuery('');
  }, []);

  const prevPathRef = React.useRef(location.pathname);
  React.useEffect(() => {
    const prev = prevPathRef.current;
    const next = location.pathname;
    prevPathRef.current = next;

    if (next === '/search') return;
    if (prev !== next) {
      clearSearch();
    }
  }, [clearSearch, location.pathname]);

  React.useEffect(() => {
    if (!authed || onboardingCompleted === false) return;
    if (location.pathname !== '/search') return;
    const q = (searchQFromUrl ?? '').trim();
    if (!q) return;
    setSearchInput((prev) => (prev ? prev : q));
  }, [authed, location.pathname, onboardingCompleted, searchQFromUrl]);

  return (
    <div>
      <header className="topbar">
        <div className="container">
          <div className="topbar-inner">
            <Link to="/" className="brand link-reset">
              EMZ
            </Link>
            {authed ? (
              <>
                {onboardingCompleted !== false ? (
                  <nav className="nav nav-left">
                    <NavLink
                      to="/recommendations"
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                      onClick={clearSearch}
                    >
                      Рекомендации
                    </NavLink>
                    <NavLink
                      to="/watchlist"
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                      onClick={clearSearch}
                    >
                      Хочу посмотреть
                    </NavLink>
                    <NavLink
                      to="/collections"
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                      onClick={clearSearch}
                    >
                      Подборки
                    </NavLink>
                    <NavLink
                      to="/profile"
                      className={({ isActive }) => `nav-link ${isActive ? 'nav-link--active' : ''}`}
                      onClick={clearSearch}
                    >
                      Профиль
                    </NavLink>
                  </nav>
                ) : (
                  <div />
                )}
                <div className="topbar-actions">
                  {onboardingCompleted !== false ? (
                    <div className="topbar-searchWrap">
                      <input
                        value={searchInput}
                        onChange={(e) => setSearchInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') setSearchInput('');
                        }}
                        placeholder="Поиск…"
                        className="topbar-search"
                        aria-label="Поиск"
                      />
                      {searchInput?.trim() ? (
                        <button className="topbar-searchClear" onClick={() => setSearchInput('')} aria-label="Очистить поиск">
                          ×
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                  {user?.name ? (
                    <Link to="/profile" className="topbar-user link-reset" onClick={clearSearch} aria-label="Профиль">
                      <span className="topbar-user__avatar" aria-hidden="true">
                        {String(user.name).trim().slice(0, 1).toUpperCase()}
                      </span>
                      <span className="topbar-user__name">{user.name}</span>
                    </Link>
                  ) : null}
                  <button
                    className="btn btn-sm"
                    onClick={() => {
                      clearAuth({ redirectToLogin: true, includeNext: false });
                    }}
                  >
                    Выйти
                  </button>
                  <button
                    className="btn btn-sm"
                    onClick={toggleTheme}
                    aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
                    title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                  >
                    {themeIcon}
                  </button>
                </div>
              </>
            ) : (
              <div className="topbar-actions">
                <Link to="/login" className="btn btn-sm link-reset">
                  Войти
                </Link>
                <Link to="/register" className="btn btn-sm link-reset">
                  Регистрация
                </Link>
                <button
                  className="btn btn-sm"
                  onClick={toggleTheme}
                  aria-label={theme === 'dark' ? 'Включить светлую тему' : 'Включить тёмную тему'}
                  title={theme === 'dark' ? 'Светлая тема' : 'Тёмная тема'}
                >
                  {themeIcon}
                </button>
              </div>
            )}
          </div>
        </div>
      </header>

      <main className="container main">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
          <Route path="/onboarding" element={<OnboardingPage />} />
          <Route path="/search" element={authed ? <SearchPage /> : <Navigate to="/login" replace />} />
          <Route
            path="/settings"
            element={authed && onboardingCompleted === false ? <Navigate to="/onboarding" replace /> : <SettingsPage />}
          />
          <Route
            path="/watchlist"
            element={authed && onboardingCompleted === false ? <Navigate to="/onboarding" replace /> : <WatchlistPage />}
          />
          <Route
            path="/collections"
            element={authed && onboardingCompleted === false ? <Navigate to="/onboarding" replace /> : <CollectionsPage />}
          />
          <Route
            path="/profile"
            element={authed && onboardingCompleted === false ? <Navigate to="/onboarding" replace /> : <ProfilePage />}
          />
          <Route path="/:type/:id" element={<DetailPage />} />
          <Route
            path="/recommendations"
            element={authed && onboardingCompleted === false ? <Navigate to="/onboarding" replace /> : <HomePage searchQuery={searchQuery} onSearchQueryChange={setSearchInput} />}
          />
          <Route
            path="/"
            element={authed ? <Navigate to="/recommendations" replace /> : <LandingPage />}
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}
