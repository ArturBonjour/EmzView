# EMZ View — гибридная рекомендательная система фильмов и сериалов

Дипломный full-stack проект с персональными рекомендациями, онбордингом, Telegram-ботом и ML-сервисом.

## Что внутри

- **Frontend** (`frontend/`): React + Vite, тёмная/светлая тема, анимированные карточки, поиск, профиль, настройки.
- **Backend** (`backend/`): Node.js + Express + MongoDB, JWT-авторизация, оценки, подборки, агрегации профиля.
- **ML Service** (`ml-service/`): FastAPI + TF-IDF + user-user collaborative filtering.
- **Telegram Bot** (`telegram-bot/`): Telegraf-бот с рекомендациями, настроением и историей оценок.

## Быстрый запуск (рекомендуется)

1. Скопируйте переменные:

```bash
cp .env.example .env
```

2. Заполните минимум:
- `TMDB_API_KEY`
- `TELEGRAM_BOT_TOKEN`
- `JWT_SECRET`
- `BOT_SHARED_SECRET`

3. Запустите:

```bash
docker compose up --build
```

Сервисы:
- Frontend: http://localhost:5173
- Backend: http://localhost:8080
- ML: http://localhost:8000
- MongoDB: `mongodb://localhost:27017`

## Запуск локально без Docker

### Backend

```bash
cd backend
npm install
npm run dev
```

### ML Service

```bash
cd ml-service
python -m venv .venv
source .venv/bin/activate  # Linux/macOS
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
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
```

## Наполнение базы (для качественных рекомендаций)

Сначала зарегистрируйтесь и получите JWT (`/api/auth/register` или `/api/auth/login`), затем:

```bash
# Trending
curl -X POST http://localhost:8080/api/movies/sync/trending \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"pages":3,"types":["movie","tv"],"maxItems":400}'

# Popular
curl -X POST http://localhost:8080/api/movies/sync/popular \
  -H "Authorization: Bearer <JWT>" \
  -H "Content-Type: application/json" \
  -d '{"pages":3,"types":["movie","tv"],"maxItems":400}'
```

## Основные API эндпоинты

- `POST /api/auth/register`, `POST /api/auth/login`
- `GET /api/recommendations/for-you?limit=20&type=movie|tv`
- `GET /api/recommendations/similar-users?limit=20&type=movie|tv`
- `GET /api/recommendations/mood?mood=fun|sad|tense|chill&type=movie|tv`
- `POST /api/actions/rate`
- `GET /api/actions/history`
- `GET /api/users/stats`

## Проверки и качество

На текущий момент в репозитории есть сборка фронтенда:

```bash
cd frontend
npm run build
```

Автотесты/линтеры в `package.json` сервисов пока не добавлены.

## Важные примечания

- Для корректной работы рекомендаций база должна содержать фильмы/сериалы и оценки пользователей.
- Telegram-бот требует корректных `BOT_SHARED_SECRET`, `BACKEND_URL`, `FRONTEND_URL`.
- `TMDB_API_KEY` обязателен для поиска, синка и обогащения карточек.
