# EMZ View

> **Гибридная рекомендательная система фильмов и сериалов с мультиплатформенным интерфейсом**  
> Дипломный full-stack проект · КФУ · 2026

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Python](https://img.shields.io/badge/Python-3.11-3776AB?logo=python&logoColor=white)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![MongoDB](https://img.shields.io/badge/MongoDB-6-47A248?logo=mongodb&logoColor=white)](https://mongodb.com)
[![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![Telegraf](https://img.shields.io/badge/Telegraf-4-2CA5E0?logo=telegram&logoColor=white)](https://telegraf.js.org)

---

## Содержание

- [О проекте](#о-проекте)
- [Возможности](#возможности)
- [Архитектура](#архитектура)
- [Структура проекта](#структура-проекта)
- [Быстрый запуск](#быстрый-запуск)
- [Запуск без Docker](#запуск-без-docker)
- [Переменные окружения](#переменные-окружения)
- [Наполнение базы](#наполнение-базы)
- [API Reference](#api-reference)
- [Telegram-бот](#telegram-бот)
- [Алгоритмы ML](#алгоритмы-ml)
- [Сборка и проверка](#сборка-и-проверка)

---

## О проекте

EMZ View решает проблему «паралича выбора» при поиске кино: алгоритм автоматически собирает персональную ленту, объясняет каждую рекомендацию и позволяет взаимодействовать как через веб-интерфейс, так и через Telegram-бот с единым профилем.

**Ключевые особенности:**
- Гибридная стратегия рекомендаций (TF-IDF → SVD по мере накопления истории)
- Объяснение каждой рекомендации («потому что вам понравился …»)
- 7 настроений для быстрого выбора контента
- Полностью кнопочный Telegram-бот без текстовых команд
- Идеальный онбординг: минимум 12 оценок + бесконечная прокрутка
- Тёмная и светлая тема, переключение без перезагрузки
- Деградированный режим при недоступности ML-сервиса (без 5xx)

---

## Возможности

| Функция | Веб | Telegram |
|---|---|---|
| Регистрация / вход | ✅ | ✅ (привязка по email) |
| Онбординг (≥ 12 оценок) | ✅ | — |
| Лента «Для вас» | ✅ | ✅ |
| Рекомендации по настроению (7 штук) | ✅ | ✅ |
| «Потому что вам понравилось…» | ✅ | — |
| «Похожий вкус» (user-user CF) | ✅ | — |
| Лайк / дизлайк | ✅ | ✅ |
| Список «Хочу посмотреть» (Watchlist) | ✅ | ✅ |
| История оценок | ✅ | ✅ |
| Поиск по названию | ✅ | — |
| Подборки (тренды / новинки / топ) | ✅ | — |
| Карточка объекта с деталями | ✅ | — |
| Настройки аккаунта / пароля | ✅ | ✅ (выход) |
| Смена темы (тёмная / светлая) | ✅ | — |

---

## Архитектура

```
                          ПОЛЬЗОВАТЕЛИ
              Веб-браузер              Telegram-клиент
                  │                          │
         HTTP/HTTPS                 Telegram Bot API
                  │                          │
     ┌────────────▼──────┐      ┌────────────▼──────────┐
     │    FRONTEND        │      │    TELEGRAM-BOT        │
     │  React 18 + Vite   │      │  Node.js + Telegraf 4  │
     │  React Router 6    │      │  Inline-keyboard UX    │
     │  11 страниц SPA    │      │  In-memory sessions    │
     └────────────┬───────┘      └────────────┬──────────┘
                  │                           │
                  └──────────┬────────────────┘
                             │ HTTP REST + JWT
                             ▼
     ┌───────────────────────────────────────────────┐
     │                  BACKEND                       │
     │         Node.js 20 + Express 4 + ESM           │
     │  CORS │ Rate Limit │ Morgan │ JWT-auth          │
     │  /api/auth  /api/users  /api/movies             │
     │  /api/actions  /api/watchlist                   │
     │  /api/recommendations  (17 эндпоинтов)          │
     │  In-memory TTL cache · bcrypt · Zod             │
     └──────────┬────────────────────────┬────────────┘
                │ HTTP REST              │ pymongo
                ▼                        ▼
     ┌──────────────────┐    ┌───────────────────────┐
     │   ML-SERVICE      │    │      MONGODB 6         │
     │ Python + FastAPI  │    │  users · movies        │
     │ TF-IDF (sklearn)  │    │  ratings · watchlists  │
     │ SVD (numpy)       │    │  Compound unique idx   │
     │ user-user CF      │    │  Docker volume         │
     │ MMR Re-ranker     │    └───────────────────────┘
     └──────────────────┘
                │ TMDB API v3
                ▼
     ┌──────────────────────┐
     │  themoviedb.org      │
     │  метаданные фильмов  │
     └──────────────────────┘
```

Все сервисы работают в изолированной Docker-сети `emz-net` и конфигурируются единым файлом `.env`.

---

## Структура проекта

```
EmzView/
├── backend/                    # Node.js + Express API
│   ├── src/
│   │   ├── index.js            # точка входа
│   │   ├── models/             # Mongoose-схемы (User, Rating, Movie, Watchlist)
│   │   ├── routes/             # маршруты: auth, users, movies, actions, recommendations, watchlist
│   │   ├── middleware/         # auth.js (JWT), rateLimiter.js
│   │   └── lib/                # tmdb.js, cache.js
│   ├── Dockerfile
│   └── package.json
│
├── ml-service/                 # Python + FastAPI ML-сервис
│   ├── app/
│   │   ├── main.py             # FastAPI приложение
│   │   ├── schemas.py          # Pydantic-схемы
│   │   ├── routers/            # recommend.py
│   │   └── services/           # data.py, recommender.py, mood.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── frontend/                   # React 18 + Vite SPA
│   ├── src/ui/
│   │   ├── App.jsx             # корень SPA, маршрутизатор, навбар
│   │   ├── styles.css          # глобальные стили (CSS Custom Properties)
│   │   ├── components/         # PosterCard, RecommendRow, ErrorBoundary, Row
│   │   ├── lib/                # api.js (axios + retry), toast.js
│   │   └── pages/              # 11 страниц SPA (см. ниже)
│   ├── Dockerfile
│   └── package.json
│
├── telegram-bot/               # Node.js + Telegraf бот
│   ├── src/index.js            # единый модуль, полностью кнопочный UX
│   ├── Dockerfile
│   └── package.json
│
├── docker-compose.yml          # оркестрация всех сервисов
├── .env.example                # шаблон переменных окружения
└── Диплом_ВКР_EMZ_View.md     # ВКР
```

**11 страниц Frontend SPA:**

| Маршрут | Страница | Описание |
|---|---|---|
| `/` | LandingPage | Публичная лендинг-страница с hero-секцией и обзором функций |
| `/login` | LoginPage | Вход с show/hide пароля |
| `/register` | RegisterPage | Регистрация с индикатором надёжности пароля |
| `/onboarding` | OnboardingPage | Выбор ≥ 12 фильмов/сериалов, IntersectionObserver |
| `/recommendations` | HomePage | 6 витрин рекомендаций параллельной загрузки |
| `/:type/:id` | DetailPage | Карточка объекта с подробной информацией |
| `/profile` | ProfilePage | Профиль, статистика, история оценок |
| `/settings` | SettingsPage | Аккаунт, пароль, восстановление, тема, интенсивность |
| `/watchlist` | WatchlistPage | Список «Хочу посмотреть» |
| `/collections` | CollectionsPage | Тренды, новинки, топ |
| `/search` | SearchPage | Поиск по названию с debounce |

---

## Быстрый запуск

### 1. Скопируйте конфигурацию

```bash
cp .env.example .env
```

### 2. Заполните обязательные переменные в `.env`

| Переменная | Где получить |
|---|---|
| `TMDB_API_KEY` | [developer.themoviedb.org](https://developer.themoviedb.org/docs/getting-started) |
| `TELEGRAM_BOT_TOKEN` | [@BotFather](https://t.me/BotFather) в Telegram |
| `JWT_SECRET` | любая случайная строка ≥ 32 символа |
| `BOT_SHARED_SECRET` | любая случайная строка ≥ 16 символов |

### 3. Запустите стек

```bash
docker compose up --build
```

**Сервисы после запуска:**

| Сервис | URL |
|---|---|
| Frontend | http://localhost:5173 |
| Backend API | http://localhost:8080 |
| ML Service | http://localhost:8000 |
| MongoDB | mongodb://localhost:27017 |

> **Первый запуск займёт 3–7 минут** (сборка образов, загрузка зависимостей Python).

---

## Запуск без Docker

Требует MongoDB 6+ и Node.js 20+. Запускайте сервисы в разных терминалах.

### Backend

```bash
cd backend
npm install
npm run dev
# → http://localhost:8080
```

### ML Service

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
# → http://localhost:8000
```

### Telegram Bot

```bash
cd telegram-bot
npm install
npm run dev
```

### Frontend

```bash
cd frontend
npm install
npm run dev
# → http://localhost:5173
```

---

## Переменные окружения

Все сервисы читают единый корневой файл `.env` (через `env_file: .env` в Docker Compose).

| Переменная | Обязательна | Описание |
|---|---|---|
| `MONGODB_URI` | **Да** | URI подключения к MongoDB |
| `JWT_SECRET` | **Да** | Секрет для подписи JWT-токенов |
| `TMDB_API_KEY` | **Да** | API-ключ The Movie Database |
| `TELEGRAM_BOT_TOKEN` | **Да** | Токен Telegram-бота (@BotFather) |
| `BOT_SHARED_SECRET` | **Да** | Секрет для авторизации бот-запросов в Backend |
| `ML_SERVICE_URL` | **Да** | URL ML-сервиса (по умолчанию `http://ml-service:8000`) |
| `BACKEND_URL` | **Да** | URL Backend для бота (по умолчанию `http://backend:8080`) |
| `FRONTEND_URL` | Нет | URL Frontend для ссылок в боте |
| `COLLAB_MIN_INTERACTIONS` | Нет | Порог переключения на CF-стратегию (по умолчанию `5`) |
| `MMR_LAMBDA` | Нет | Параметр разнообразия MMR (по умолчанию `0.7`) |
| `LLM_ENABLED` | Нет | Включить LLM-переформулировку объяснений (`false`) |
| `RECOMMENDATIONS_CACHE_TTL_SEC` | Нет | TTL кэша рекомендаций в секундах (по умолчанию `120`) |

Полный список с описаниями см. в `.env.example`.

---

## Наполнение базы

Для качественных рекомендаций база должна содержать фильмы и сериалы. Сначала авторизуйтесь:

```bash
TOKEN=$(curl -s -X POST http://localhost:8080/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"your_password"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['token'])")
```

Затем синхронизируйте контент из TMDB:

```bash
# Трендовые (рекомендуется для старта)
curl -s -X POST http://localhost:8080/api/movies/sync/trending \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pages":3,"types":["movie","tv"],"maxItems":400}'

# Популярные
curl -s -X POST http://localhost:8080/api/movies/sync/popular \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"pages":3,"types":["movie","tv"],"maxItems":400}'
```

После синхронизации зарегистрируйтесь на сайте и пройдите онбординг (≥ 12 оценок) — рекомендации появятся сразу.

---

## API Reference

Все защищённые эндпоинты требуют заголовка `Authorization: Bearer <JWT>`.

### Аутентификация

| Метод | Маршрут | Описание |
|---|---|---|
| `POST` | `/api/auth/register` | Регистрация `{email, password, name}` |
| `POST` | `/api/auth/login` | Вход `{email, password}` |
| `POST` | `/api/auth/telegram` | Авторизация/привязка через бот |
| `POST` | `/api/auth/request-password-reset` | Запрос кода восстановления пароля |
| `POST` | `/api/auth/reset-password` | Применение кода восстановления |

### Пользователь

| Метод | Маршрут | Описание |
|---|---|---|
| `GET` | `/api/users/me` | Данные текущего пользователя |
| `PUT` | `/api/users/me` | Обновление имени / email |
| `POST` | `/api/users/change-password` | Смена пароля (требует текущий) |
| `GET` | `/api/users/stats` | Статистика (лайки, дизлайки, watchlist) |
| `PUT` | `/api/users/onboarding` | Завершить онбординг с избранными объектами |

### Рекомендации

| Метод | Маршрут | Параметры | Описание |
|---|---|---|---|
| `GET` | `/api/recommendations/for-you` | `limit`, `type` | Персональная витрина |
| `GET` | `/api/recommendations/mood` | `mood`, `limit`, `type` | По настроению (7 вариантов) |
| `GET` | `/api/recommendations/because` | `tmdbId`, `type`, `limit` | «Потому что…» |
| `GET` | `/api/recommendations/similar-users` | `limit`, `type` | «Похожий вкус» |

### Оценки и Watchlist

| Метод | Маршрут | Описание |
|---|---|---|
| `POST` | `/api/actions/rate` | Оценить объект `{tmdbId, mediaType, value: 1\|-1}` |
| `GET` | `/api/actions/history` | История оценок с cursor-пагинацией |
| `GET` | `/api/actions/my-rating` | Оценка конкретного объекта |
| `POST` | `/api/watchlist` | Добавить в watchlist |
| `DELETE` | `/api/watchlist` | Убрать из watchlist |
| `GET` | `/api/watchlist` | Список watchlist |
| `GET` | `/api/watchlist/status` | Статус объекта в watchlist |

### Фильмы

| Метод | Маршрут | Описание |
|---|---|---|
| `GET` | `/api/movies/:type/:id` | Детали объекта (из MongoDB + TMDB) |
| `GET` | `/api/movies/search` | Поиск по названию |
| `POST` | `/api/movies/sync/trending` | Синхронизация трендовых из TMDB |
| `POST` | `/api/movies/sync/popular` | Синхронизация популярных из TMDB |

---

## Telegram-бот

Бот полностью управляется инлайн-кнопками. Единственная текстовая команда — `/start` для первого входа.

**Главное меню:**

```
✨ Что посмотреть?    →  3 персональные рекомендации
🎭 По настроению      →  клавиатура из 7 настроений
📜 История            →  последние 5 оценок
🔖 Хочу посмотреть   →  список закладок
⚙️ Настройки          →  помощь, выход, ссылка на сайт
```

**Настроения:** 🎉 Весёлое · 😢 Грустное · ⚡ Напряжённое · 🍦 Спокойное · 💕 Романтичное · 💥 Боевик · 👻 Ужасы

**Кнопки на карточке:** 👍 Лайк · 👎 Дизлайк · 🔖 В список · 🌐 Подробнее · ➡️ Ещё

Если сессия истекла — бот показывает кнопку «🚀 Авторизоваться» без необходимости вводить команду.

---

## Алгоритмы ML

ML-сервис реализует 5 стратегий рекомендаций с автоматическим переключением:

| Стратегий | Условие активации | Описание |
|---|---|---|
| `cold_start` | 0 взаимодействий | Тренды и топ TMDB |
| `content_tfidf` | 1–4 взаимодействия | TF-IDF с boost: title×3, genres×2 |
| `content_tfidf` (профиль) | 5–7 взаимодействий | Усреднённый TF-IDF профиля |
| `collaborative_svd` | ≥ 8 взаимодействий | SVD (k=32) + user-user CF (30 соседей) |
| `mood` | запрос настроения | Тематические ключевые слова |

После ранжирования применяется **MMR** (Maximal Marginal Relevance, λ=0.7) для увеличения разнообразия без потери релевантности.

**Измеренный эффект MMR:** разнообразие топ-10 выросло на 32% по косинусному сходству, число уникальных жанров — на 76%.

---

## Сборка и проверка

```bash
# Сборка фронтенда
cd frontend && npm install && npm run build

# Проверка Backend
cd backend && npm install

# Проверка ML-сервиса
cd ml-service && pip install -r requirements.txt
python -c "from app.main import app; print('OK')"

# Проверка бота
cd telegram-bot && npm install
```

Автоматизированные тесты (Jest, pytest, Supertest) являются направлением дальнейшего развития — см. раздел «Заключение» в ВКР.

---

## Лицензия

MIT — свободно используйте в учебных и коммерческих целях.

