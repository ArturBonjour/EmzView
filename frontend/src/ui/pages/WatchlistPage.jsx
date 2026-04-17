import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import { api, formatApiError, getStoredAuthToken, setAuthToken } from '../lib/api.js';
import { PosterCard } from '../components/PosterCard.jsx';

export function WatchlistPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const token = getStoredAuthToken();
    if (!token) return;
    setAuthToken(token);

    setLoading(true);
    api
      .get('/api/watchlist?limit=200')
      .then((res) => {
        setItems(res.data?.watchlist ?? []);
      })
      .catch((err) => {
        setError(formatApiError(err, 'Не удалось загрузить список просмотра.'));
      })
      .finally(() => setLoading(false));
  }, []);

  function handleRemoved(item) {
    setItems((prev) =>
      prev.filter((x) => !(x.tmdbId === item.tmdbId && x.mediaType === item.mediaType))
    );
  }

  if (loading) {
    return (
      <div className="u-mt24">
        <h1 className="hero-title u-mb18">Список просмотра</h1>
        <div className="card-grid">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="card">
              <div className="card-poster skeleton" style={{ height: 240 }} />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="u-mt24">
        <h1 className="hero-title u-mb18">Список просмотра</h1>
        <div className="error">{error}</div>
      </div>
    );
  }

  return (
    <div className="u-mt24">
      <h1 className="hero-title u-mb8">Список просмотра</h1>
      <p className="hero-desc u-mb18">
        {items.length > 0
          ? `${items.length} ${items.length === 1 ? 'фильм/сериал' : 'фильмов/сериалов'} в вашем списке`
          : 'Список пуст — добавляйте фильмы и сериалы кнопкой 🔖'}
      </p>

      {items.length === 0 ? (
        <div className="hero" style={{ textAlign: 'center', padding: '48px 24px' }}>
          <div style={{ fontSize: 48, marginBottom: 16 }}>🔖</div>
          <p className="hero-desc">
            Нажмите на кнопку закладки на любой карточке фильма или сериала, чтобы добавить в этот список.
          </p>
          <Link to="/recommendations" className="btn btn--primary" style={{ marginTop: 16, display: 'inline-block' }}>
            Перейти к рекомендациям
          </Link>
        </div>
      ) : (
        <div className="card-grid">
          {items.map((it) => (
            <PosterCard
              key={`${it.mediaType}:${it.tmdbId}`}
              item={it}
              onRated={(item, action) => {
                if (action === 'dislike') handleRemoved(item);
              }}
            />
          ))}
        </div>
      )}
    </div>
  );
}
