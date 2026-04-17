import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';

import { api, formatApiError, persistAuthToken } from '../lib/api.js';
import { toastError, toastSuccess } from '../lib/toast.js';

function EyeIcon({ open }) {
  return open ? (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
    </svg>
  ) : (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
      <line x1="1" y1="1" x2="23" y2="23"/>
    </svg>
  );
}

export function LoginPage() {
  const location = useLocation();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState('login');
  const [resetTokenDev, setResetTokenDev] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetNewPassword2, setResetNewPassword2] = useState('');
  const [resetOk, setResetOk] = useState(false);
  const [resetDone, setResetDone] = useState(false);

  React.useEffect(() => {
    setResetDone(false);
    setResetOk(false);
    setResetTokenDev('');
    setResetToken('');
    setResetNewPassword('');
    setResetNewPassword2('');
  }, [mode]);

  React.useEffect(() => {
    setResetDone(false);
    setResetOk(false);
  }, [email]);

  function authError(err, fallback) {
    const status = err?.response?.status;
    const msg = String(err?.response?.data?.error ?? '').toLowerCase();
    if (status === 401) return 'Неверный email или пароль.';
    if (status === 400 && msg.includes('token')) return 'Код недействителен или истёк. Запросите новый.';
    return formatApiError(err, fallback);
  }

  const nextFromUrl = React.useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const raw = String(sp.get('next') ?? '').trim();
    if (!raw) return '';
    if (!raw.startsWith('/')) return '';
    if (raw.startsWith('//')) return '';
    if (raw.startsWith('/login') || raw.startsWith('/register')) return '';
    return raw;
  }, [location.search]);

  async function onLogin(e) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setSaving(true);

    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setSaving(false);
      setError('Проверьте email.');
      return;
    }
    if (!password) {
      setSaving(false);
      setError('Введите пароль.');
      return;
    }

    try {
      const { data } = await api.post('/api/auth/login', { email: cleanEmail, password });
      persistAuthToken(data.token);
      toastSuccess('Вы вошли');
      try {
        const me = await api.get('/api/users/me');
        const completedAt = me?.data?.user?.onboarding?.completedAt;
        if (nextFromUrl) window.location.href = nextFromUrl;
        else window.location.href = completedAt ? '/recommendations' : '/onboarding';
      } catch (err) {
        window.location.href = nextFromUrl || '/recommendations';
      }
    } catch (err) {
      const msg = authError(err, 'Не удалось войти. Попробуйте ещё раз.');
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function requestReset(e) {
    e.preventDefault();
    if (saving) return;
    setError('');
    setResetOk(false);
    setResetTokenDev('');

    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Проверьте email.');
      return;
    }

    setSaving(true);
    try {
      const { data } = await api.post('/api/auth/request-password-reset', { email: cleanEmail });
      setResetOk(true);
      toastSuccess('Если аккаунт существует — код создан.');
      if (data?.token) {
        setResetTokenDev(String(data.token));
        setResetToken(String(data.token));
      }
    } catch (err) {
      const msg = authError(err, 'Не удалось запросить код. Попробуйте ещё раз.');
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  async function doReset(e) {
    e.preventDefault();
    if (saving) return;
    setError('');

    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Проверьте email.');
      return;
    }
    const tok = String(resetToken ?? '').trim();
    if (tok.length < 10) {
      setError('Введите код восстановления.');
      return;
    }
    if ((resetNewPassword ?? '').length < 8) {
      setError('Новый пароль должен быть не короче 8 символов.');
      return;
    }
    if (resetNewPassword !== resetNewPassword2) {
      setError('Пароли не совпадают.');
      return;
    }

    setSaving(true);
    try {
      await api.post('/api/auth/reset-password', {
        email: cleanEmail,
        token: tok,
        newPassword: resetNewPassword,
      });
      setMode('login');
      setResetDone(true);
      setPassword('');
      setResetNewPassword('');
      setResetNewPassword2('');
      setError('');
    } catch (err) {
      const msg = authError(err, 'Не удалось сбросить пароль. Попробуйте ещё раз.');
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card hero">
        <h1 className="hero-title u-mb6">{mode === 'login' ? 'Войти' : 'Восстановление'}</h1>
        <p className="hero-desc">
          {mode === 'login'
            ? 'Вернёмся к рекомендациям за пару секунд.'
            : 'Получите код и задайте новый пароль.'}
        </p>

        {error ? <div className="error u-mt10">{error}</div> : null}
        {!error && resetDone && mode === 'login' ? <div className="small u-mt10">Пароль обновлён. Теперь можно войти.</div> : null}

        <form onSubmit={mode === 'login' ? onLogin : doReset} className="auth-form u-mt14">
          <label className="auth-label">
            <div className="small">Email</div>
            <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </label>

          {mode === 'login' ? (
            <label className="auth-label">
              <div className="small">Пароль</div>
              <div className="auth-pw-wrap">
                <input className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Ваш пароль" type={showPw ? 'text' : 'password'} autoComplete="current-password" />
                <button type="button" className="auth-pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Скрыть пароль' : 'Показать пароль'}>
                  <EyeIcon open={showPw} />
                </button>
              </div>
            </label>
          ) : (
            <>
              <div className="hero-actions hero-actions--g8">
                <button className="btn" type="button" onClick={requestReset} disabled={saving || !String(email ?? '').trim().includes('@')}>
                  {saving ? 'Отправляю…' : 'Получить код'}
                </button>
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setMode('login');
                    setError('');
                  }}
                  disabled={saving}
                >
                  Назад
                </button>
              </div>
              {resetOk ? <div className="small u-mt8">Если аккаунт существует — код создан.</div> : null}
              {import.meta.env.DEV && resetTokenDev ? <div className="small u-mt8">DEV-код: {resetTokenDev}</div> : null}

              <label className="auth-label">
                <div className="small">Код</div>
                <input className="auth-input" value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Вставьте код" />
              </label>
              <label className="auth-label">
                <div className="small">Новый пароль</div>
                <input className="auth-input" value={resetNewPassword} onChange={(e) => setResetNewPassword(e.target.value)} placeholder="Минимум 8 символов" type="password" autoComplete="new-password" />
              </label>
              <label className="auth-label">
                <div className="small">Повторите пароль</div>
                <input className="auth-input" value={resetNewPassword2} onChange={(e) => setResetNewPassword2(e.target.value)} placeholder="Ещё раз" type="password" autoComplete="new-password" />
              </label>
            </>
          )}

          {mode === 'login' ? (
            <>
              <button className="btn btn--primary u-mt8" type="submit" disabled={saving || !String(email ?? '').trim().includes('@') || !password}>
                {saving ? 'Вхожу…' : 'Войти'}
              </button>
              <div className="hero-actions hero-actions--mt12 hero-actions--g8">
                <button
                  className="btn"
                  type="button"
                  onClick={() => {
                    setMode('reset');
                    setError('');
                  }}
                  disabled={saving}
                >
                  Забыли пароль?
                </button>
              </div>
            </>
          ) : (
            <button className="btn btn--primary u-mt8" type="submit" disabled={saving || !resetToken || !resetNewPassword || !resetNewPassword2}>
              {saving ? 'Сохраняю…' : 'Сбросить пароль'}
            </button>
          )}

          <div className="small u-mt10">
            Нет аккаунта? <Link to="/register" className="auth-link">Создать</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
