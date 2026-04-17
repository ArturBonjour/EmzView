import { Router } from 'express';
import { z } from 'zod';

import { requireAuth } from '../middleware/auth.js';
import { Rating } from '../models/Rating.js';
import { Movie } from '../models/Movie.js';
import { mlClient } from '../lib/mlClient.js';
import { cacheGet, cacheSet } from '../lib/cache.js';
import { posterUrl, tmdbClient } from '../lib/tmdb.js';
import { llmRewriteExplanation } from '../lib/llm.js';

export const recommendationsRouter = Router();

async function getRatingsSignature(userId) {
  const [count, last] = await Promise.all([
    Rating.countDocuments({ userId }),
    Rating.findOne({ userId }).sort({ updatedAt: -1, _id: -1 }).select({ updatedAt: 1 }).lean(),
  ]);

  const t = last?.updatedAt ? new Date(last.updatedAt).toISOString() : 'none';
  return `${count}:${t}`;
}

recommendationsRouter.get('/for-you', requireAuth, async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(500).default(20).parse(req.query.limit ?? '20');
    const mediaType = z.enum(['movie', 'tv']).optional().parse(req.query.type);

    const userId = req.user.userId;
    const signature = await getRatingsSignature(userId);
    const cacheKey = `for-you:${userId}:${signature}:${mediaType ?? 'all'}:${limit}`;

    const ttlSec = Number(process.env.RECOMMENDATIONS_CACHE_TTL_SEC ?? 120);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const ratings = await Rating.find({ userId }).lean();

    const profile = {
      user_id: userId,
      interactions: ratings.map((r) => ({
        tmdb_id: r.tmdbId,
        media_type: r.mediaType,
        value: r.value,
      })),
    };

    try {
      const ml = mlClient();
      const { data } = await ml.post('/recommend/for-you', {
        profile,
        limit,
      });

      const recs = await hydrateRecommendations(data.recommendations ?? [], mediaType);

      const payload = { recommendations: recs, strategy: data.strategy };
      cacheSet(cacheKey, payload, ttlSec * 1000);

      return res.json(payload);
    } catch {
      const payload = { recommendations: [], strategy: 'unavailable' };
      cacheSet(cacheKey, payload, Math.min(ttlSec, 30) * 1000);
      return res.json(payload);
    }
  } catch (err) {
    return next(err);
  }
});

recommendationsRouter.get('/similar-users', requireAuth, async (req, res, next) => {
  try {
    const limit = z.coerce.number().int().min(1).max(500).default(20).parse(req.query.limit ?? '20');
    const mediaType = z.enum(['movie', 'tv']).optional().parse(req.query.type);

    const userId = req.user.userId;
    const signature = await getRatingsSignature(userId);
    const cacheKey = `similar-users:${userId}:${signature}:${mediaType ?? 'all'}:${limit}`;

    const ttlSec = Number(process.env.RECOMMENDATIONS_CACHE_TTL_SEC ?? 120);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    const ratings = await Rating.find({ userId }).lean();
    const profile = {
      user_id: userId,
      interactions: ratings.map((r) => ({
        tmdb_id: r.tmdbId,
        media_type: r.mediaType,
        value: r.value,
      })),
    };

    try {
      const ml = mlClient();
      const { data } = await ml.post('/recommend/similar-users', {
        profile,
        limit,
      });

      const recs = await hydrateRecommendations(data.recommendations ?? [], mediaType);
      const payload = { recommendations: recs, strategy: data.strategy, neighborCount: data.neighbor_count ?? 0 };
      cacheSet(cacheKey, payload, ttlSec * 1000);

      return res.json(payload);
    } catch {
      const payload = { recommendations: [], strategy: 'unavailable', neighborCount: 0 };
      cacheSet(cacheKey, payload, Math.min(ttlSec, 30) * 1000);
      return res.json(payload);
    }
  } catch (err) {
    return next(err);
  }
});

recommendationsRouter.get('/because', requireAuth, async (req, res, next) => {
  try {
    const seedTmdbId = z.coerce.number().int().positive().parse(req.query.tmdbId);
    const mediaType = z.enum(['movie', 'tv']).default('movie').parse(req.query.type ?? 'movie');
    const limit = z.coerce.number().int().min(1).max(500).default(20).parse(req.query.limit ?? '20');
    const page = z.coerce.number().int().min(1).max(500).default(1).parse(req.query.page ?? '1');

    if (page > 1) {
      try {
        const tmdb = tmdbClient();
        const endpoint = mediaType === 'tv' ? `/tv/${seedTmdbId}/recommendations` : `/movie/${seedTmdbId}/recommendations`;
        const { data } = await tmdb.get(endpoint, { params: { page } });
        const results = (data?.results ?? []).slice(0, limit);

        const payload = {
          recommendations: results.map((r) => ({
            tmdbId: r.id,
            mediaType,
            title: mediaType === 'tv' ? r.name : r.title,
            overview: r.overview ?? '',
            posterUrl: posterUrl(r.poster_path ?? null),
            score: null,
            explanation: null,
          })),
          strategy: 'tmdb_recommendations',
          page,
          totalPages: Number.isFinite(data?.total_pages) ? data.total_pages : null,
        };

        return res.json(payload);
      } catch {
        return res.json({ recommendations: [], strategy: 'unavailable', page, totalPages: null });
      }
    }

    try {
      const ml = mlClient();
      const { data } = await ml.post('/recommend/because', {
        seed: { tmdb_id: seedTmdbId, media_type: mediaType },
        limit,
      });

      const recs = await hydrateRecommendations(data.recommendations ?? [], mediaType);

      const minAcceptable = Math.min(8, Math.max(3, Math.floor(limit / 2)));
      if ((recs?.length ?? 0) >= minAcceptable) {
        return res.json({ recommendations: recs, strategy: data.strategy });
      }
      // fall through to TMDB-based fallback
    } catch {
      // fall through to TMDB-based fallback
    }

    try {
      const tmdb = tmdbClient();
      const endpoint = mediaType === 'tv' ? `/tv/${seedTmdbId}/recommendations` : `/movie/${seedTmdbId}/recommendations`;
      const { data } = await tmdb.get(endpoint, { params: { page } });
      const results = (data?.results ?? []).slice(0, limit);

      const payload = {
        recommendations: results.map((r) => ({
          tmdbId: r.id,
          mediaType,
          title: mediaType === 'tv' ? r.name : r.title,
          overview: r.overview ?? '',
          posterUrl: posterUrl(r.poster_path ?? null),
          score: null,
          explanation: null,
        })),
        strategy: 'tmdb_recommendations',
        page,
        totalPages: Number.isFinite(data?.total_pages) ? data.total_pages : null,
      };

      return res.json(payload);
    } catch {
      return res.json({ recommendations: [], strategy: 'unavailable' });
    }
  } catch (err) {
    return next(err);
  }
});

recommendationsRouter.get('/mood', requireAuth, async (req, res, next) => {
  try {
    const mood = z.enum(['fun', 'sad', 'tense', 'chill']).parse(req.query.mood);
    const limit = z.coerce.number().int().min(1).max(500).default(20).parse(req.query.limit ?? '20');
    const mediaType = z.enum(['movie', 'tv']).optional().parse(req.query.type);

    const userId = req.user.userId;
    const signature = await getRatingsSignature(userId);
    const cacheKey = `mood:${userId}:${signature}:${mood}:${mediaType ?? 'all'}:${limit}`;

    const ttlSec = Number(process.env.RECOMMENDATIONS_CACHE_TTL_SEC ?? 120);
    const cached = cacheGet(cacheKey);
    if (cached) return res.json(cached);

    try {
      const ml = mlClient();
      const { data } = await ml.post('/recommend/mood', {
        mood,
        limit,
      });

      const recs = await hydrateRecommendations(data.recommendations ?? [], mediaType);
      const payload = { recommendations: recs, strategy: data.strategy };
      cacheSet(cacheKey, payload, ttlSec * 1000);
      return res.json(payload);
    } catch {
      const payload = { recommendations: [], strategy: 'unavailable' };
      cacheSet(cacheKey, payload, Math.min(ttlSec, 30) * 1000);
      return res.json(payload);
    }
  } catch (err) {
    return next(err);
  }
});

async function hydrateRecommendations(recommendations, mediaTypeFilter) {
  const normalized = (recommendations ?? []).map((r) => ({
    tmdbId: Number(r?.tmdb_id),
    mediaType: r?.media_type === 'tv' || r?.media_type === 'movie' ? r.media_type : null,
    score: r?.score,
    explanation: r?.explanation,
  }));
  const ids = normalized.map((r) => r.tmdbId).filter((x) => Number.isFinite(x));
  const uniqIds = Array.from(new Set(ids));

  if (mediaTypeFilter && uniqIds.length) {
    const existing = await Movie.find({ tmdbId: { $in: uniqIds }, mediaType: mediaTypeFilter })
      .select({ tmdbId: 1 })
      .lean();
    const existingIds = new Set((existing ?? []).map((m) => m.tmdbId));
    const missingCap = Math.min(200, Math.max(60, uniqIds.length));
    const missing = uniqIds.filter((id) => !existingIds.has(id)).slice(0, missingCap);

    if (missing.length) {
      const tmdb = tmdbClient();
      await Promise.allSettled(
        missing.map(async (tmdbId) => {
          const endpoint = mediaTypeFilter === 'tv' ? `/tv/${tmdbId}` : `/movie/${tmdbId}`;
          const { data } = await tmdb.get(endpoint, { params: { append_to_response: 'credits,keywords' } });

          const title = mediaTypeFilter === 'tv' ? data.name : data.title;
          const genres = (data.genres ?? []).map((g) => ({ id: g.id, name: g.name }));
          const cast = (data.credits?.cast ?? []).slice(0, 15).map((c) => c.name).filter(Boolean);
          const keywords =
            mediaTypeFilter === 'tv'
              ? (data.keywords?.results ?? []).map((k) => k.name)
              : (data.keywords?.keywords ?? []).map((k) => k.name);

          await Movie.updateOne(
            { tmdbId, mediaType: mediaTypeFilter },
            {
              $setOnInsert: {
                tmdbId,
                mediaType: mediaTypeFilter,
                title,
                overview: data.overview ?? '',
                posterPath: data.poster_path ?? null,
                genres,
                cast,
                keywords: (keywords ?? []).filter(Boolean).slice(0, 30),
                releaseDate: mediaTypeFilter === 'tv' ? data.first_air_date ?? null : data.release_date ?? null,
                popularity: data.popularity ?? 0,
              },
            },
            { upsert: true }
          );
        })
      );
    }
  }

  const movieQuery = mediaTypeFilter
    ? { tmdbId: { $in: ids }, mediaType: mediaTypeFilter }
    : { tmdbId: { $in: ids } };
  const movies = await Movie.find(movieQuery).lean();
  const byKey = new Map(movies.map((m) => [`${m.mediaType}:${m.tmdbId}`, m]));
  const byId = new Map();
  for (const m of movies) {
    if (!byId.has(m.tmdbId)) byId.set(m.tmdbId, m);
  }

  const becauseIds = normalized
    .map((r) => {
      const m = typeof r.explanation === 'string' ? r.explanation.match(/\b(\d{2,})\b/) : null;
      return m ? Number(m[1]) : null;
    })
    .filter((x) => Number.isFinite(x));

  const becauseMovieQuery = mediaTypeFilter
    ? { tmdbId: { $in: becauseIds }, mediaType: mediaTypeFilter }
    : { tmdbId: { $in: becauseIds } };
  const becauseMovies = becauseIds.length
    ? await Movie.find(becauseMovieQuery).lean()
    : [];
  const becauseByKey = new Map(becauseMovies.map((m) => [`${m.mediaType}:${m.tmdbId}`, m]));
  const becauseById = new Map();
  for (const m of becauseMovies) {
    if (!becauseById.has(m.tmdbId)) becauseById.set(m.tmdbId, m);
  }

  const hydrated = normalized
    .map((r) => {
      const m = r.mediaType ? byKey.get(`${r.mediaType}:${r.tmdbId}`) : byId.get(r.tmdbId);
      if (!m) return null;
      if (mediaTypeFilter && m.mediaType !== mediaTypeFilter) return null;
      const becauseMap = r.mediaType ? becauseByKey : becauseById;
      return {
        tmdbId: m.tmdbId,
        mediaType: m.mediaType,
        title: m.title,
        overview: m.overview,
        posterUrl: posterUrl(m.posterPath),
        score: r.score,
        explanation: rewriteExplanation(r.explanation, becauseMap, r.mediaType),
      };
    })
    .filter(Boolean);

  try {
    await rewriteExplanationsInPlace(hydrated);
  } catch {
    // ignore
  }
  return hydrated;
}

async function rewriteExplanationsInPlace(items) {
  const concurrency = Math.min(Number(process.env.LLM_CONCURRENCY ?? 4), 8);
  let idx = 0;

  async function worker() {
    while (idx < items.length) {
      const i = idx;
      idx += 1;

      const it = items[i];
      if (!it?.explanation) continue;
      try {
        it.explanation = await llmRewriteExplanation(it.explanation);
      } catch {
        // keep original explanation
      }
    }
  }

  await Promise.all(Array.from({ length: concurrency }, () => worker()));
}

function rewriteExplanation(explanation, becauseMap, mediaType) {
  if (typeof explanation !== 'string' || !explanation) return explanation ?? null;

  const match = explanation.match(/\b(\d{2,})\b/);
  if (!match) return explanation;

  const id = Number(match[1]);
  const seed = becauseMap.get(id) ?? (mediaType ? becauseMap.get(`${mediaType}:${id}`) : null);
  if (!seed?.title) return explanation;

  return explanation.replace(match[1], seed.title);
}
