import React from 'react';
import { Link } from 'react-router-dom';

export function LandingPage() {
  return (
    <div className="landing">
      <section className="landing-hero">
        <div className="landing-hero__inner">
          <div className="landing-hero__copy">
            <div className="landing-kicker">Персональные рекомендации фильмов и сериалов</div>
            <h1 className="landing-title">
              Лента, которая
              {' '}
              <span className="landing-title__accent">попадает в ваш вкус</span>
            </h1>
            <p className="landing-subtitle">
              Оценивайте контент — и EMZ соберёт витрины «для вас» и «потому что вам понравилось…».
              Никаких перегруженных объяснений — только конкретные подборки.
            </p>

            <div className="landing-cta">
              <Link to="/register" className="btn btn--primary link-reset">Начать бесплатно</Link>
              <Link to="/login" className="btn link-reset">Войти</Link>
            </div>
            <div className="landing-note">После входа откроются подборки трендов и новинок.</div>
          </div>

          <div className="landing-hero__visual" aria-hidden="true">
            <div className="landing-showcase">
              <div className="landing-showcase__row">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <div key={idx} className="landing-tile" />
                ))}
              </div>
              <div className="landing-showcase__row landing-showcase__row--offset">
                {Array.from({ length: 7 }).map((_, idx) => (
                  <div key={idx} className="landing-tile landing-tile--alt" />
                ))}
              </div>
              <div className="landing-showcase__fade" />
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section__head">
          <h2 className="landing-h2">Что внутри</h2>
          <div className="landing-h2sub">Три понятных витрины вместо десятка случайных</div>
        </div>

        <div className="landing-features">
          <div className="landing-feature">
            <div className="landing-feature__title">Для вас</div>
            <div className="landing-feature__desc">Главная лента по вашему вкусу — обновляется после каждой оценки.</div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__title">По настроению</div>
            <div className="landing-feature__desc">Выберите одно из 7 настроений — весёлое, грустное, напряжённое, романтичное и другие.</div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__title">Потому что…</div>
            <div className="landing-feature__desc">Похожие по атмосфере и стилю — от ваших последних лайков.</div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__title">Telegram-бот</div>
            <div className="landing-feature__desc">Рекомендации, лайки и список «хочу посмотреть» прямо в Telegram — один аккаунт, всё синхронизировано.</div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__title">Хочу посмотреть</div>
            <div className="landing-feature__desc">Сохраняйте интересное в список и возвращайтесь, когда появится время.</div>
          </div>
          <div className="landing-feature">
            <div className="landing-feature__title">Подборки</div>
            <div className="landing-feature__desc">Тренды, новинки и топ — когда хочется просто выбрать без размышлений.</div>
          </div>
        </div>
      </section>

      <section className="landing-section">
        <div className="landing-section__head">
          <h2 className="landing-h2">Как это работает</h2>
          <div className="landing-h2sub">Быстро, без лишних шагов</div>
        </div>

        <div className="landing-steps">
          <div className="landing-step">
            <div className="landing-step__num">01</div>
            <div>
              <div className="landing-step__title">Соберите вкус</div>
              <div className="landing-step__desc">Поставьте несколько лайков/дизлайков в онбординге или через поиск.</div>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step__num">02</div>
            <div>
              <div className="landing-step__title">Смотрите витрины</div>
              <div className="landing-step__desc">«Для вас» + «Потому что…» + 1 витрина по настроению.</div>
            </div>
          </div>
          <div className="landing-step">
            <div className="landing-step__num">03</div>
            <div>
              <div className="landing-step__title">Точность растёт</div>
              <div className="landing-step__desc">Каждая новая оценка делает рекомендации заметно лучше.</div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
