import dotenv from 'dotenv';
import { Telegraf, Markup } from 'telegraf';
import axios from 'axios';

dotenv.config();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) throw new Error('TELEGRAM_BOT_TOKEN is required');

const backend = axios.create({
  baseURL: process.env.BACKEND_URL ?? 'http://localhost:8080',
  timeout: 20_000,
});

const bot = new Telegraf(token);

const sessions = new Map();

function getSession(userId) {
  if (!sessions.has(userId)) sessions.set(userId, { jwt: null, pendingEmail: false });
  return sessions.get(userId);
}

bot.start(async (ctx) => {
  const s = getSession(ctx.from.id);
  s.pendingEmail = false;

  try {
    const { data } = await backend.post('/api/auth/telegram', {
      telegramUserId: ctx.from.id,
      secret: process.env.BOT_SHARED_SECRET,
    });
    s.jwt = data.token;
    
    await ctx.reply(
      'Привет! Я EMZ — твой умный гид по кино и сериалам. 🍿\n\nЯ помогу тебе найти что-то под настроение или посоветую новинки.',
      Markup.inlineKeyboard([
        [Markup.button.callback('✨ Что посмотреть?', 'menu:recommend')],
        [Markup.button.callback('🎭 Выбрать настроение', 'menu:mood')],
        [Markup.button.callback('📜 История', 'menu:history')]
      ])
    );
  } catch (err) {
    const msg = err?.response?.data?.error;
    if (msg === 'email is required for first-time Telegram link') {
      s.pendingEmail = true;
      await ctx.reply('Первый запуск: отправь свой email (сообщением), чтобы связать аккаунт.');
      return;
    }

    await ctx.reply('Не удалось авторизоваться. Проверь настройки backend/bot.');
  }
});

bot.on('text', async (ctx, next) => {
  const s = getSession(ctx.from.id);
  if (!s.pendingEmail) return next();

  const email = (ctx.message.text ?? '').trim();
  if (!email.includes('@')) {
    await ctx.reply('Похоже не на email. Попробуй ещё раз.');
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
    await ctx.reply('Аккаунт привязан. Используй /recommend.');
  } catch {
    await ctx.reply('Не удалось привязать email. Попробуй позже.');
  }
});

bot.action('menu:main', async (ctx) => {
  await ctx.editMessageText(
    'Главное меню 🎬',
    Markup.inlineKeyboard([
      [Markup.button.callback('✨ Что посмотреть?', 'menu:recommend')],
      [Markup.button.callback('🎭 Выбрать настроение', 'menu:mood')],
      [Markup.button.callback('📜 История', 'menu:history')]
    ])
  );
});

async function sendRecommendation(ctx, jwt, params = {}) {
  const mood = typeof params?.mood === 'string' ? params.mood : null;
  const endpoint = mood ? '/api/recommendations/mood' : '/api/recommendations/for-you';
  const requestParams = mood ? { mood, limit: 1 } : { limit: 1 };

  const { data } = await backend.get(endpoint, {
    params: requestParams,
    headers: { Authorization: `Bearer ${jwt}` },
  });

  const r = data.recommendations?.[0];
  if (!r) {
    return ctx.reply('Пока нет рекомендаций. Поставь лайки в приложении или попробуй другой фильтр.', 
      Markup.inlineKeyboard([Markup.button.callback('🏠 Главное меню', 'menu:main')])
    );
  }

  const text = `<b>${r.title}</b>\n\n${(r.overview ?? '').slice(0, 400)}...\n\n<i>${r.explanation ?? ''}</i>`;
  
  await ctx.replyWithHTML(
    text,
    Markup.inlineKeyboard([
      [
        Markup.button.callback('👍 Лайк', `rate:like:${r.tmdbId}:${r.mediaType}`),
        Markup.button.callback('👎 Дизлайк', `rate:dislike:${r.tmdbId}:${r.mediaType}`)
      ],
      [
        Markup.button.url('🌐 На сайте', `${process.env.FRONTEND_URL || 'http://localhost:5173'}/${r.mediaType || 'movie'}/${r.tmdbId}`),
        Markup.button.callback('➡️ Ещё вариант', 'menu:recommend')
      ],
      [Markup.button.callback('🏠 Главное меню', 'menu:main')]
    ])
  );
}

bot.action('menu:recommend', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');
  await sendRecommendation(ctx, s.jwt);
});

bot.action('menu:mood', async (ctx) => {
  await ctx.editMessageText(
    '🎭 Какое сегодня настроение?\nВыберите вариант, и я подберу подходящее кино.',
    Markup.inlineKeyboard([
      [Markup.button.callback('🎉 Веселое', 'mood:fun'), Markup.button.callback('😢 Грустное', 'mood:sad')],
      [Markup.button.callback('⚡ Напряженное', 'mood:tense'), Markup.button.callback('🍦 Спокойное', 'mood:chill')],
      [Markup.button.callback('🏠 Главное меню', 'menu:main')]
    ])
  );
});

bot.action(/^mood:(.+)$/, async (ctx) => {
  const mood = ctx.match[1];
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');
  
  await ctx.answerCbQuery(`🔍 Ищу что-то ${mood}...`);
  await sendRecommendation(ctx, s.jwt, { mood });
});

bot.action('menu:history', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');

  try {
    const { data } = await backend.get('/api/actions/history?limit=5', {
      headers: { Authorization: `Bearer ${s.jwt}` },
    });

    if (!data.history?.length) {
      return ctx.editMessageText('📜 Ваша история оценок пуста.\nНачните оценивать фильмы, чтобы я лучше понимал ваш вкус!', 
        Markup.inlineKeyboard([Markup.button.callback('🏠 Главное меню', 'menu:main')])
      );
    }

    let text = '📜 <b>Последние оценки:</b>\n\n';
    data.history.forEach(h => {
      const icon = h.value === 1 ? '✅' : '❌';
      text += `${icon} <b>${h.title}</b>\n`;
    });

    await ctx.editMessageText(text, {
      parse_mode: 'HTML',
      ...Markup.inlineKeyboard([
        [Markup.button.url('🌐 Весь профиль', `${process.env.FRONTEND_URL || 'http://localhost:5173'}/profile`)],
        [Markup.button.callback('🏠 Главное меню', 'menu:main')]
      ])
    });
  } catch (err) {
    await ctx.answerCbQuery('Ошибка загрузки истории');
  }
});

bot.action(/^rate:(like|dislike):(\d+):(movie|tv)$/i, async (ctx) => {
  const [, action, tmdbIdRaw, mediaType] = ctx.match;
  const tmdbId = Number(tmdbIdRaw);
  const s = getSession(ctx.from.id);
  
  if (!s?.jwt) return ctx.answerCbQuery('Нужна авторизация');

  await backend.post(
    '/api/actions/rate',
    { tmdbId, mediaType, value: action === 'like' ? 1 : -1, source: 'telegram' },
    { headers: { Authorization: `Bearer ${s.jwt}` } }
  );

  await ctx.answerCbQuery(action === 'like' ? 'Лайк!' : 'Дизлайк!');
  // Можно обновить сообщение или просто оставить как есть
});

bot.command('recommend', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Сначала авторизуйся.');
  await sendRecommendation(ctx, s.jwt);
});

bot.command('history', async (ctx) => {
  const s = getSession(ctx.from.id);
  if (!s?.jwt) return ctx.reply('Сначала авторизуйся.');
  
  const { data } = await backend.get('/api/actions/history?limit=5', {
    headers: { Authorization: `Bearer ${s.jwt}` },
  });
  
  let text = 'История:\n';
  data.history?.forEach(h => { text += `${h.value === 1 ? '👍' : '👎'} ${h.title}\n`; });
  await ctx.reply(text);
});

bot.launch();

process.once('SIGINT', () => bot.stop('SIGINT'));
process.once('SIGTERM', () => bot.stop('SIGTERM'));
