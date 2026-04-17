import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

const backend = axios.create({
  baseURL: process.env.BACKEND_URL ?? 'http://localhost:8080',
  timeout: 20_000,
});

const bot = new Telegraf(token);

// In-memory sessions (survive as long as process is alive)
const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, { jwt: null, pendingEmail: false });
  return sessions.get(userId);
}

// ── Main menu keyboard ──────────────────────────────────────────────────────
const MAIN_MENU = Markup.inlineKeyboard([
  [Markup.button.callback('✨ Что посмотреть?', 'menu:recommend')],
  [Markup.button.callback('🎭 По настроению', 'menu:mood')],
  [Markup.button.callback('📜 История', 'menu:history'), Markup.button.callback('🔖 Хочу посмотреть', 'menu:watchlist')],
]);

const MAIN_MENU_TEXT = '🎬 <b>EMZ</b> — умный гид по кино и сериалам.\nЧто сделаем?';

// ── Auth helpers ────────────────────────────────────────────────────────────
async function authSession(ctx) {
  const s = getSession(ctx.from.id);
  if (!s.jwt) {
    await ctx.reply('Нужна авторизация. Нажми /start.');
    return null;
  }
  return s;
}

// ── /start ─────────────────────────────────────────────────────────────────
bot.start(async (ctx) => {
  const s = getSession(ctx.from.id);
  s.pendingEmail = false;

  try {
    const { data } = await backend.post('/api/auth/telegram', {
      telegramUserId: ctx.from.id,
      secret: process.env.BOT_SHARED_SECRET,
    });
    s.jwt = data.token;

    const firstName = ctx.from.first_name ?? 'друг';
    await ctx.replyWithHTML(
      `👋 Привет, <b>${firstName}</b>!\n\n${MAIN_MENU_TEXT}`,
      MAIN_MENU,
    );
  } catch (err) {
    const msg = err?.response?.data?.error;
    if (msg === 'email is required for first-time Telegram link') {
      s.pendingEmail = true;
      await ctx.reply(
        '👋 Первый запуск!\n\nОтправь email своего аккаунта EMZ View — и я привяжу бот к твоему профилю.\n\nЕсли аккаунта ещё нет, сначала зарегистрируйся на сайте.',
      );
      return;
    }
    await ctx.reply('⚠️ Не удалось авторизоваться. Проверь настройки backend.');
  }
});

// ── /help ──────────────────────────────────────────────────────────────────
bot.command('help', async (ctx) => {
  await ctx.replyWithHTML(
    '<b>Доступные команды:</b>\n\n' +
    '/start — главное меню\n' +
    '/recommend — 3 свежие рекомендации\n' +
    '/mood — выбрать настроение\n' +
    '/history — последние оценки\n' +
    '/watchlist — список «Хочу посмотреть»\n' +
    '/logout — выйти из аккаунта\n' +
    '/help — эта справка',
  );
});

// ── /logout ────────────────────────────────────────────────────────────────
bot.command('logout', async (ctx) => {
  const s = getSession(ctx.from.id);
  s.jwt = null;
  s.pendingEmail = false;
  await ctx.reply('Вы вышли из аккаунта. Нажми /start для повторной авторизации.');
});

// ── /menu shortcut ─────────────────────────────────────────────────────────
bot.command('menu', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Нужна авторизация. Нажми /start.');
  await ctx.replyWithHTML(MAIN_MENU_TEXT, MAIN_MENU);
});

// ── Handle email input for first-time link ──────────────────────────────────
bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (!s.pendingEmail) return next();

  const email = (ctx.message.text ?? '').trim();
  if (!email.includes('@')) {
    await ctx.reply('Похоже, это не email. Попробуй ещё раз.');
    return;
  }

  try {
    const { data } = await backend.post('/api/auth/telegram', {
      telegramUserId: ctx.from.id,
      secret: process.env.BOT_SHARED_SECRET,
      email,
      name: `${ctx.from.first_name ?? ''} ${ctx.from.last_name ?? ''}`.trim() || 'Telegram User',
    });
    s.jwt = data.token;
    s.pendingEmail = false;
    await ctx.replyWithHTML(
      `✅ Аккаунт привязан!\n\n${MAIN_MENU_TEXT}`,
      MAIN_MENU,
    );
  } catch {
    await ctx.reply('⚠️ Не удалось привязать email. Проверь правильность и попробуй ещё раз.');
  }
});

// ── Main menu action ────────────────────────────────────────────────────────
bot.action('menu:main', async (ctx) => {
  await ctx.answerCbQuery();
  try {
    await ctx.editMessageText(MAIN_MENU_TEXT, { parse_mode: 'HTML', ...MAIN_MENU });
  } catch {
    await ctx.replyWithHTML(MAIN_MENU_TEXT, MAIN_MENU);
  }
});

// ── Format a single recommendation card ────────────────────────────────────
function formatCard(r, idx, total) {
  const typeLabel = r.mediaType === 'tv' ? '📺 Сериал' : '🎬 Фильм';
  const header = total > 1 ? `<b>[${idx + 1}/${total}]</b> ` : '';
  const overview = (r.overview ?? '').trim();
  const shortOverview = overview.length > 350 ? overview.slice(0, 347) + '…' : overview;
  const explanation = (r.explanation ?? '').trim();

  let text = `${header}${typeLabel}  <b>${r.title}</b>`;
  if (shortOverview) text += `\n\n${shortOverview}`;
  if (explanation) text += `\n\n<i>💡 ${explanation}</i>`;
  return text;
}

function cardKeyboard(r) {
  return Markup.inlineKeyboard([
    [
      Markup.button.callback('👍', `rate:like:${r.tmdbId}:${r.mediaType}`),
      Markup.button.callback('👎', `rate:dislike:${r.tmdbId}:${r.mediaType}`),
      Markup.button.callback('🔖', `watch:add:${r.tmdbId}:${r.mediaType}`),
    ],
    [
      Markup.button.url('🌐 Подробнее', `${FRONTEND_URL}/${r.mediaType || 'movie'}/${r.tmdbId}`),
      Markup.button.callback('➡️ Ещё', 'menu:recommend'),
    ],
    [Markup.button.callback('🏠 Меню', 'menu:main')],
  ]);
}

// ── Send N recommendations (default 3) ─────────────────────────────────────
async function sendRecommendations(ctx, jwt, params = {}) {
  const mood = typeof params?.mood === 'string' ? params.mood : null;
  const count = params?.count ?? 3;
  const endpoint = mood ? '/api/recommendations/mood' : '/api/recommendations/for-you';
  const queryParams = mood ? { mood, limit: count } : { limit: count };

  const { data } = await backend.get(endpoint, {
    params: queryParams,
    headers: { Authorization: `Bearer ${jwt}` },
  });

  const recs = data.recommendations ?? [];
  if (!recs.length) {
    const msg = mood
      ? 'Не нашёл ничего под это настроение. Попробуй другое!'
      : 'Пока нет рекомендаций. Оцени несколько фильмов — и я всё настрою!';
    return ctx.replyWithHTML(msg, Markup.inlineKeyboard([
      [Markup.button.callback('🏠 Меню', 'menu:main')],
    ]));
  }

  for (const [i, r] of recs.entries()) {
    await ctx.replyWithHTML(formatCard(r, i, recs.length), cardKeyboard(r));
  }
}

// ── /recommend command ──────────────────────────────────────────────────────
bot.command('recommend', async (ctx) => {
  const s = await authSession(ctx);
  if (!s) return;
  try {
    await sendRecommendations(ctx, s.jwt);
  } catch {
    await ctx.reply('⚠️ Ошибка при получении рекомендаций. Попробуй позже.');
  }
});

bot.action('menu:recommend', async (ctx) => {
  await ctx.answerCbQuery('🔍 Ищу для тебя…');
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Нужна авторизация. Нажми /start.');
  try {
    await sendRecommendations(ctx, s.jwt);
  } catch {
    await ctx.reply('⚠️ Ошибка при получении рекомендаций. Попробуй позже.');
  }
});

// ── Mood selection ──────────────────────────────────────────────────────────
const MOOD_KEYBOARD = Markup.inlineKeyboard([
  [Markup.button.callback('🎉 Весёлое', 'mood:fun'), Markup.button.callback('😢 Грустное', 'mood:sad')],
  [Markup.button.callback('⚡ Напряжённое', 'mood:tense'), Markup.button.callback('🍦 Спокойное', 'mood:chill')],
  [Markup.button.callback('💕 Романтичное', 'mood:romantic'), Markup.button.callback('💥 Боевик', 'mood:action')],
  [Markup.button.callback('👻 Ужасы', 'mood:horror')],
  [Markup.button.callback('🏠 Меню', 'menu:main')],
]);

const MOOD_LABELS = {
  fun: '🎉 Весёлое',
  sad: '😢 Грустное',
  tense: '⚡ Напряжённое',
  chill: '🍦 Спокойное',
  romantic: '💕 Романтичное',
  action: '💥 Боевик',
  horror: '👻 Ужасы',
};

bot.command('mood', async (ctx) => {
  const s = await authSession(ctx);
  if (!s) return;
  await ctx.replyWithHTML('🎭 <b>Выбери настроение</b> — подберу подходящее кино:', MOOD_KEYBOARD);
});

bot.action('menu:mood', async (ctx) => {
  await ctx.answerCbQuery();
  await ctx.replyWithHTML('🎭 <b>Выбери настроение</b> — подберу подходящее кино:', MOOD_KEYBOARD);
});

bot.action(/^mood:(.+)$/, async (ctx) => {
  const mood = ctx.match[1];
  if (!MOOD_LABELS[mood]) return ctx.answerCbQuery('Неизвестное настроение');
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');

  await ctx.answerCbQuery(`${MOOD_LABELS[mood]} — ищу…`);
  try {
    await sendRecommendations(ctx, s.jwt, { mood });
  } catch {
    await ctx.reply('⚠️ Ошибка при получении рекомендаций.');
  }
});

// ── History ─────────────────────────────────────────────────────────────────
async function showHistory(ctx, s, edit = false) {
  const { data } = await backend.get('/api/actions/history?limit=5', {
    headers: { Authorization: `Bearer ${s.jwt}` },
  });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🌐 Весь профиль', `${FRONTEND_URL}/profile`)],
    [Markup.button.callback('🏠 Меню', 'menu:main')],
  ]);

  if (!data.history?.length) {
    const text = '📜 История пуста.\nОцени несколько фильмов — и здесь появятся ваши оценки!';
    if (edit) return ctx.editMessageText(text, keyboard);
    return ctx.reply(text, keyboard);
  }

  let text = '📜 <b>Последние оценки:</b>\n\n';
  data.history.forEach((h) => {
    text += `${h.value === 1 ? '✅' : '❌'} <b>${h.title}</b>\n`;
  });

  if (edit) return ctx.editMessageText(text, { parse_mode: 'HTML', ...keyboard });
  return ctx.replyWithHTML(text, keyboard);
}

bot.command('history', async (ctx) => {
  const s = await authSession(ctx);
  if (!s) return;
  try {
    await showHistory(ctx, s, false);
  } catch {
    await ctx.reply('⚠️ Ошибка загрузки истории.');
  }
});

bot.action('menu:history', async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Нужна авторизация. Нажми /start.');
  try {
    await showHistory(ctx, s, false);
  } catch {
    await ctx.reply('⚠️ Ошибка загрузки истории.');
  }
});

// ── Watchlist ────────────────────────────────────────────────────────────────
async function showWatchlist(ctx, s) {
  const { data } = await backend.get('/api/watchlist?limit=5', {
    headers: { Authorization: `Bearer ${s.jwt}` },
  });

  const keyboard = Markup.inlineKeyboard([
    [Markup.button.url('🌐 Открыть список', `${FRONTEND_URL}/watchlist`)],
    [Markup.button.callback('🏠 Меню', 'menu:main')],
  ]);

  const items = data.items ?? data.watchlist ?? [];
  if (!items.length) {
    return ctx.reply('🔖 Список «Хочу посмотреть» пуст.\nДобавляй фильмы прямо из рекомендаций!', keyboard);
  }

  let text = '🔖 <b>Хочу посмотреть:</b>\n\n';
  items.slice(0, 5).forEach((it, i) => {
    text += `${i + 1}. <b>${it.title ?? it.tmdbId}</b> ${it.mediaType === 'tv' ? '📺' : '🎬'}\n`;
  });
  if (items.length > 5) text += `\n…и ещё ${items.length - 5} в списке`;
  return ctx.replyWithHTML(text, keyboard);
}

bot.command('watchlist', async (ctx) => {
  const s = await authSession(ctx);
  if (!s) return;
  try {
    await showWatchlist(ctx, s);
  } catch {
    await ctx.reply('⚠️ Ошибка загрузки списка.');
  }
});

bot.action('menu:watchlist', async (ctx) => {
  await ctx.answerCbQuery();
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Нужна авторизация. Нажми /start.');
  try {
    await showWatchlist(ctx, s);
  } catch {
    await ctx.reply('⚠️ Ошибка загрузки списка.');
  }
});

// ── Add to watchlist ─────────────────────────────────────────────────────────
bot.action(/^watch:add:(\d+):(movie|tv)$/i, async (ctx) => {
  const [, tmdbIdRaw, mediaType] = ctx.match;
  const tmdbId = Number(tmdbIdRaw);
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');

  try {
    await backend.post(
      '/api/watchlist',
      { tmdbId, mediaType },
      { headers: { Authorization: `Bearer ${s.jwt}` } },
    );
    await ctx.answerCbQuery('🔖 Добавлено в список!');
  } catch {
    await ctx.answerCbQuery('⚠️ Уже в списке или ошибка');
  }
});

// ── Rate (like / dislike) ────────────────────────────────────────────────────
bot.action(/^rate:(like|dislike):(\d+):(movie|tv)$/i, async (ctx) => {
  const [, action, tmdbIdRaw, mediaType] = ctx.match;
  const tmdbId = Number(tmdbIdRaw);
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');

  try {
    await backend.post(
      '/api/actions/rate',
      { tmdbId, mediaType, value: action === 'like' ? 1 : -1, source: 'telegram' },
      { headers: { Authorization: `Bearer ${s.jwt}` } },
    );

    const label = action === 'like' ? '👍 Лайк сохранён!' : '👎 Дизлайк сохранён!';
    await ctx.answerCbQuery(label);

    // Edit the inline keyboard: replace like/dislike row with a "rated" indicator
    try {
      const ratedLabel = action === 'like' ? '✅ Лайк' : '❌ Дизлайк';
      const currentMarkup = ctx.callbackQuery.message?.reply_markup;
      if (currentMarkup) {
        const newRows = currentMarkup.inline_keyboard.map((row) =>
          row.map((btn) => {
            if (btn.callback_data === `rate:like:${tmdbId}:${mediaType}` || btn.callback_data === `rate:dislike:${tmdbId}:${mediaType}`) {
              return btn.callback_data === `rate:${action}:${tmdbId}:${mediaType}`
                ? { text: ratedLabel, callback_data: 'noop' }
                : { text: '—', callback_data: 'noop' };
            }
            return btn;
          }),
        );
        await ctx.editMessageReplyMarkup({ inline_keyboard: newRows });
      }
    } catch {
      // Editing the keyboard is best-effort
    }
  } catch {
    await ctx.answerCbQuery('⚠️ Ошибка при сохранении оценки');
  }
});

// ── noop (already-rated buttons) ────────────────────────────────────────────
bot.action('noop', (ctx) => ctx.answerCbQuery());

// ── Launch ───────────────────────────────────────────────────────────────────
bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
