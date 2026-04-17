import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';

import { requireAuth } from '../middleware/auth.js';
import { User } from '../models/User.js';
import { Rating } from '../models/Rating.js';
import { Movie } from '../models/Movie.js';
import { tmdbClient, posterUrl } from '../lib/tmdb.js';

export const usersRouter = Router();

usersRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId).lean();
    if (!user) return res.status(404).json({ error: 'User not found' });

    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        onboarding: user.onboarding,
      },
    });
  } catch (err) {
    return next(err);
  }
});

const updateMeSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  email: z.string().email().max(160).optional(),
});

usersRouter.put('/me', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { name, email } = updateMeSchema.parse(req.body ?? {});

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const nextEmail = email != null ? String(email).trim().toLowerCase() : null;
    if (nextEmail && nextEmail !== String(user.email).toLowerCase()) {
      const existing = await User.findOne({ email: nextEmail }).lean();
      if (existing && String(existing._id) !== String(userId)) {
        return res.status(409).json({ error: 'Email already exists' });
      }
      user.email = nextEmail;
    }

    if (name != null) user.name = String(name).trim();

    await user.save();

    return res.json({
      user: {
        id: user._id.toString(),
        email: user.email,
        name: user.name,
        onboarding: user.onboarding,
      },
    });
  } catch (err) {
    return next(err);
  }
});

const changePasswordSchema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(8).max(200),
});

usersRouter.post('/change-password', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { currentPassword, newPassword } = changePasswordSchema.parse(req.body ?? {});

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    const ok = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'Invalid credentials' });

    user.passwordHash = await bcrypt.hash(newPassword, 10);
    user.passwordResetTokenHash = null;
    user.passwordResetExpiresAt = null;
    await user.save();

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/onboarding/candidates', requireAuth, async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(10).max(60).default(40).parse(req.query.limit ?? '40');
    const page = z.coerce.number().int().min(1).max(20).default(1).parse(req.query.page ?? '1');

    const userId = req.user.userId;
    const [user, rated] = await Promise.all([
      User.findById(userId).lean(),
      Rating.find({ userId }).select({ tmdbId: 1, mediaType: 1 }).limit(5000).lean(),
    ]);

    const exclude = new Set();
    for (const r of rated ?? []) exclude.add(`${r.mediaType}:${r.tmdbId}`);
    for (const tmdbId of user?.onboarding?.favoriteMovieTmdbIds ?? []) exclude.add(`movie:${tmdbId}`);
    for (const tmdbId of user?.onboarding?.favoriteTvTmdbIds ?? []) exclude.add(`tv:${tmdbId}`);

    const tmdb = tmdbClient();

    const [trMovie, popMovie, topMovie, trTv, popTv, topTv] = await Promise.all([
      tmdb.get('/trending/movie/week', { params: { page } }),
      tmdb.get('/movie/popular', { params: { page } }),
      tmdb.get('/movie/top_rated', { params: { page } }),
      tmdb.get('/trending/tv/week', { params: { page } }),
      tmdb.get('/tv/popular', { params: { page } }),
      tmdb.get('/tv/top_rated', { params: { page } }),
    ]);

    const out = new Map();

    function isHighSignal(r) {
      if (!r?.id) return false;
      if (!r?.poster_path) return false;
      const voteCount = Number(r.vote_count ?? 0);
      const voteAverage = Number(r.vote_average ?? 0);
      const popularity = Number(r.popularity ?? 0);
      if (voteCount >= 150) return true;
      if (voteCount >= 60 && voteAverage >= 7.2) return true;
      if (popularity >= 80 && voteCount >= 40) return true;
      return false;
    }

    function pushMovie(r) {
      if (!isHighSignal(r)) return;
      if (exclude.has(`movie:${r.id}`)) return;
      const key = `movie:${r.id}`;
      if (out.has(key)) return;
      out.set(key, {
        tmdbId: r.id,
        mediaType: 'movie',
        title: r.title,
        overview: r.overview ?? '',
        posterPath: r.poster_path ?? null,
        posterUrl: posterUrl(r.poster_path, 'w342'),
        popularity: r.popularity ?? 0,
        voteCount: r.vote_count ?? 0,
        voteAverage: r.vote_average ?? 0,
      });
    }

    function pushTv(r) {
      if (!isHighSignal(r)) return;
      if (exclude.has(`tv:${r.id}`)) return;
      const key = `tv:${r.id}`;
      if (out.has(key)) return;
      out.set(key, {
        tmdbId: r.id,
        mediaType: 'tv',
        title: r.name,
        overview: r.overview ?? '',
        posterPath: r.poster_path ?? null,
        posterUrl: posterUrl(r.poster_path, 'w342'),
        popularity: r.popularity ?? 0,
        voteCount: r.vote_count ?? 0,
        voteAverage: r.vote_average ?? 0,
      });
    }

    for (const r of trMovie.data?.results ?? []) pushMovie(r);
    for (const r of topMovie.data?.results ?? []) pushMovie(r);
    for (const r of popMovie.data?.results ?? []) pushMovie(r);
    for (const r of trTv.data?.results ?? []) pushTv(r);
    for (const r of topTv.data?.results ?? []) pushTv(r);
    for (const r of popTv.data?.results ?? []) pushTv(r);

    function normTitle(s) {
      return String(s ?? '')
        .toLowerCase()
        .replace(/\([^)]*\)/g, ' ')
        .replace(/[^a-zа-я0-9]+/gi, ' ')
        .trim();
    }

    const sorted = Array.from(out.values()).sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0));
    const titleSeen = new Set();
    const results = [];
    for (const it of sorted) {
      const t = normTitle(it.title);
      if (t && titleSeen.has(t)) continue;
      if (t) titleSeen.add(t);
      results.push(it);
      if (results.length >= limit) break;
    }

    const hasMore = page < 20;
    return res.json({ results, page, hasMore });
  } catch (err) {
    return next(err);
  }
});

const onboardingSchema = z.object({
  favorites: z
    .array(
      z.object({
        tmdbId: z.number().int().positive(),
        mediaType: z.enum(['movie', 'tv']),
      })
    )
    .default([]),
  genreIds: z.array(z.number().int()).default([]),
});

usersRouter.put('/onboarding', requireAuth, async (req, res, next) => {
  try {
    const { favorites, genreIds } = onboardingSchema.parse(req.body);
    const userId = req.user.userId;

    const favMovies = favorites.filter((f) => f.mediaType === 'movie').map((f) => f.tmdbId);
    const favTv = favorites.filter((f) => f.mediaType === 'tv').map((f) => f.tmdbId);

    await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          'onboarding.favoriteMovieTmdbIds': favMovies,
          'onboarding.favoriteTvTmdbIds': favTv,
          'onboarding.favoriteGenreIds': genreIds,
          'onboarding.completedAt': new Date(),
        },
      },
      { new: true }
    );

    // Bootstrap: ensure movies exist in local DB + create positive ratings for cold-start.
    const tmdb = tmdbClient();
    for (const f of favorites.slice(0, 30)) {
      const existing = await Movie.findOne({ tmdbId: f.tmdbId, mediaType: f.mediaType });
      if (!existing) {
        const endpoint = f.mediaType === 'tv' ? `/tv/${f.tmdbId}` : `/movie/${f.tmdbId}`;
        const { data } = await tmdb.get(endpoint, { params: { append_to_response: 'credits,keywords' } });

        const title = f.mediaType === 'tv' ? data.name : data.title;
        const genres = (data.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
        const cast = (data.credits?.cast ?? []).slice(0, 15).map((c) => c.name).filter(Boolean);
        const keywords =
          f.mediaType === 'tv'
            ? (data.keywords?.results ?? []).map((k) => k.name)
            : (data.keywords?.keywords ?? []).map((k) => k.name);

        await Movie.create({
          tmdbId: f.tmdbId,
          mediaType: f.mediaType,
          title,
          overview: data.overview ?? '',
          posterPath: data.poster_path ?? null,
          genres,
          cast,
          keywords: (keywords ?? []).filter(Boolean).slice(0, 30),
          releaseDate: f.mediaType === 'tv' ? data.first_air_date ?? null : data.release_date ?? null,
          popularity: data.popularity ?? 0,
        });
      }

      await Rating.findOneAndUpdate(
        { userId, tmdbId: f.tmdbId, mediaType: f.mediaType },
        { $set: { value: 1, source: 'web' } },
        { upsert: true, new: true }
      );
    }

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

usersRouter.post('/onboarding/reset', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    await Promise.all([
      User.findByIdAndUpdate(userId, {
        $set: {
          'onboarding.favoriteMovieTmdbIds': [],
          'onboarding.favoriteTvTmdbIds': [],
          'onboarding.favoriteGenreIds': [],
          'onboarding.completedAt': null,
        },
      }),
      Rating.deleteMany({ userId }),
    ]);

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

usersRouter.get('/stats', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const [likesCount, dislikesCount] = await Promise.all([
      Rating.countDocuments({ userId, value: 1 }),
      Rating.countDocuments({ userId, value: -1 }),
    ]);

    const likedIds = await Rating.find({ userId, value: 1 })
      .select({ tmdbId: 1, mediaType: 1 })
      .limit(500)
      .lean();
    const pairs = likedIds
      .filter((r) => Number.isFinite(r?.tmdbId) && (r?.mediaType === 'movie' || r?.mediaType === 'tv'))
      .map((r) => ({ tmdbId: r.tmdbId, mediaType: r.mediaType }));
    const movies = pairs.length
      ? await Movie.find({ $or: pairs.map((p) => ({ tmdbId: p.tmdbId, mediaType: p.mediaType })) }).lean()
      : [];

    const genreCounts = new Map();
    for (const m of movies) {
      for (const g of m.genres ?? []) {
        if (!g?.id) continue;
        genreCounts.set(g.id, { id: g.id, name: g.name ?? '', count: (genreCounts.get(g.id)?.count ?? 0) + 1 });
      }
    }

    const topGenres = Array.from(genreCounts.values())
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return res.json({
      stats: {
        likesCount,
        dislikesCount,
        topGenres,
      },
    });
  } catch (err) {
    return next(err);
  }
});
