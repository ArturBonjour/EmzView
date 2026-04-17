import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { Watchlist } from '../models/Watchlist.js';
import { Movie } from '../models/Movie.js';
import { posterUrl, tmdbClient } from '../lib/tmdb.js';

export const watchlistRouter = Router();

const watchlistItemSchema = z.object({
  tmdbId: z.number().int().positive(),
  mediaType: z.enum(['movie', 'tv']),
});

// POST /api/watchlist — add item
watchlistRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const { tmdbId, mediaType } = watchlistItemSchema.parse(req.body);
    const userId = req.user.userId;

    // Ensure movie exists in local DB
    const existing = await Movie.findOne({ tmdbId, mediaType });
    if (!existing) {
      try {
        const tmdb = tmdbClient();
        const endpoint = mediaType === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
        const { data } = await tmdb.get(endpoint, { params: { append_to_response: 'credits,keywords' } });

        const title = mediaType === 'tv' ? data.name : data.title;
        const genres = (data.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
        const cast = (data.credits?.cast ?? []).slice(0, 15).map((c) => c.name).filter(Boolean);
        const keywords =
          mediaType === 'tv'
            ? (data.keywords?.results ?? []).map((k) => k.name)
            : (data.keywords?.keywords ?? []).map((k) => k.name);

        await Movie.create({
          tmdbId,
          mediaType,
          title,
          overview: data.overview ?? '',
          posterPath: data.poster_path ?? null,
          genres,
          cast,
          keywords: (keywords ?? []).filter(Boolean).slice(0, 30),
          releaseDate: mediaType === 'tv' ? data.first_air_date ?? null : data.release_date ?? null,
          popularity: data.popularity ?? 0,
        });
      } catch {
        // proceed even if TMDB enrichment fails
      }
    }

    await Watchlist.findOneAndUpdate(
      { userId, tmdbId, mediaType },
      { $setOnInsert: { userId, tmdbId, mediaType } },
      { upsert: true, new: true }
    );

    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// DELETE /api/watchlist — remove item
watchlistRouter.delete('/', requireAuth, async (req, res, next) => {
  try {
    const tmdbId = z.coerce.number().int().positive().parse(req.query.tmdbId);
    const mediaType = z.enum(['movie', 'tv']).parse(req.query.type);
    const userId = req.user.userId;

    await Watchlist.deleteOne({ userId, tmdbId, mediaType });
    return res.json({ ok: true });
  } catch (err) {
    return next(err);
  }
});

// GET /api/watchlist — list items
watchlistRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const limit = z.coerce.number().int().min(1).max(200).default(50).parse(req.query.limit ?? '50');

    const items = await Watchlist.find({ userId }).sort({ createdAt: -1 }).limit(limit).lean();

    const pairs = items.map((w) => ({ tmdbId: w.tmdbId, mediaType: w.mediaType }));
    const movies = pairs.length
      ? await Movie.find({ $or: pairs.map((p) => ({ tmdbId: p.tmdbId, mediaType: p.mediaType })) }).lean()
      : [];

    const byKey = new Map(movies.map((m) => [`${m.mediaType}:${m.tmdbId}`, m]));

    const results = items.map((w) => {
      const m = byKey.get(`${w.mediaType}:${w.tmdbId}`);
      return {
        tmdbId: w.tmdbId,
        mediaType: w.mediaType,
        title: m?.title ?? null,
        overview: m?.overview ?? null,
        posterUrl: m?.posterPath ? posterUrl(m.posterPath) : null,
        addedAt: w.createdAt,
      };
    }).filter((x) => x.title);

    return res.json({ watchlist: results });
  } catch (err) {
    return next(err);
  }
});

// GET /api/watchlist/status — check single item
watchlistRouter.get('/status', requireAuth, async (req, res, next) => {
  try {
    const tmdbId = z.coerce.number().int().positive().parse(req.query.tmdbId);
    const mediaType = z.enum(['movie', 'tv']).parse(req.query.type);
    const userId = req.user.userId;

    const item = await Watchlist.findOne({ userId, tmdbId, mediaType }).lean();
    return res.json({ inWatchlist: Boolean(item) });
  } catch (err) {
    return next(err);
  }
});
