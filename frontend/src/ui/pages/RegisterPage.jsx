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

function getPasswordStrength(pw) {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(4, score);
}

const STRENGTH_LABELS = ['', 'Слабый', 'Средний', 'Хороший', 'Надёжный'];

export function RegisterPage() {
  const location = useLocation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [showPw2, setShowPw2] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const pwStrength = getPasswordStrength(password);

  const nextFromUrl = React.useMemo(() => {
    const sp = new URLSearchParams(location.search);
    const raw = String(sp.get('next') ?? '').trim();
    if (!raw) return '';
    if (!raw.startsWith('/')) return '';
    if (raw.startsWith('//')) return '';
    if (raw.startsWith('/login') || raw.startsWith('/register')) return '';
    return raw;
  }, [location.search]);

  function authError(err, fallback) {
    const status = err?.response?.status;
    if (status === 409) return 'Аккаунт с таким email уже существует.';
    return formatApiError(err, fallback);
  }

  async function onSubmit(e) {
    e.preventDefault();
    if (saving) return;
    setError('');

    const cleanName = String(name ?? '').trim();
    const cleanEmail = String(email ?? '').trim().toLowerCase();
    if (!cleanName) {
      setError('Введите имя.');
      return;
    }
    if (!cleanEmail || !cleanEmail.includes('@')) {
      setError('Проверьте email.');
      return;
    }
    if ((password ?? '').length < 8) {
      setError('Пароль должен быть не короче 8 символов.');
      return;
    }
    if (password !== password2) {
      setError('Пароли не совпадают.');
      return;
    }

    setSaving(true);

    try {
      const { data } = await api.post('/api/auth/register', { name: cleanName, email: cleanEmail, password });
      persistAuthToken(data.token);
      toastSuccess('Аккаунт создан');
      try {
        const me = await api.get('/api/users/me');
        const completedAt = me?.data?.user?.onboarding?.completedAt;
        if (nextFromUrl) window.location.href = nextFromUrl;
        else window.location.href = completedAt ? '/recommendations' : '/onboarding';
      } catch (err) {
        window.location.href = nextFromUrl || '/onboarding';
      }
    } catch (err) {
      const msg = authError(err, 'Не удалось зарегистрироваться. Попробуйте ещё раз.');
      setError(msg);
      toastError(msg);
    } finally {
      setSaving(false);
    }
  }

  const canSubmit = Boolean(
    String(name ?? '').trim() &&
      String(email ?? '').trim().includes('@') &&
      (password ?? '').length >= 8 &&
      password === password2
  );

  return (
    <div className="auth-wrap">
      <div className="auth-card hero">
        <h1 className="hero-title u-mb6">Создать аккаунт</h1>
        <p className="hero-desc">Пара кликов — и ты в персональных рекомендациях.</p>

        {error ? <div className="error u-mt10">{error}</div> : null}

        <form onSubmit={onSubmit} className="auth-form u-mt14">
          <label className="auth-label">
            <div className="small">Имя</div>
            <input className="auth-input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как к тебе обращаться" />
          </label>

          <label className="auth-label">
            <div className="small">Email</div>
            <input className="auth-input" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" inputMode="email" autoComplete="email" />
          </label>

          <label className="auth-label">
            <div className="small">Пароль</div>
            <div className="auth-pw-wrap">
              <input className="auth-input" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Минимум 8 символов" type={showPw ? 'text' : 'password'} autoComplete="new-password" />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? 'Скрыть пароль' : 'Показать пароль'}>
                <EyeIcon open={showPw} />
              </button>
            </div>
            {password ? (
              <div className="pw-strength">
                <div className="pw-strength__bar">
                  <div className={`pw-strength__fill pw-strength__fill--${pwStrength}`} />
                </div>
                <div className="pw-strength__label">{STRENGTH_LABELS[pwStrength]}</div>
              </div>
            ) : null}
          </label>

          <label className="auth-label">
            <div className="small">Повторите пароль</div>
            <div className="auth-pw-wrap">
              <input className="auth-input" value={password2} onChange={(e) => setPassword2(e.target.value)} placeholder="Ещё раз" type={showPw2 ? 'text' : 'password'} autoComplete="new-password" />
              <button type="button" className="auth-pw-toggle" onClick={() => setShowPw2((v) => !v)} aria-label={showPw2 ? 'Скрыть пароль' : 'Показать пароль'}>
                <EyeIcon open={showPw2} />
              </button>
            </div>
          </label>

          <button className="btn btn--primary u-mt8" type="submit" disabled={saving || !canSubmit}>
            {saving ? 'Создаю…' : 'Создать аккаунт'}
          </button>

          <div className="small u-mt10">
            Уже есть аккаунт? <Link to="/login" className="auth-link">Войти</Link>
          </div>
        </form>
      </div>
    </div>
  );
}
