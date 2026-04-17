from __future__ import annotations

import os
from typing import List, Set

from app.schemas import (
    ForYouRequest,
    ForYouResponse,
    RecommendResponse,
    BecauseRequest,
    MoodRequest,
    Recommendation,
    SimilarUsersRequest,
    SimilarUsersResponse,
)
from app.services.content import (
    recommend_from_profile,
    recommend_similar,
    recommend_by_text,
    get_media_type,
    get_content_model,
)
from app.services.collab import recommend_for_user, recommend_from_similar_users


# ---------------------------------------------------------------------------
# Diversity helpers
# ---------------------------------------------------------------------------

def _mmr_rerank(
    candidates: List[tuple],  # (tmdb_id, score, *rest)
    lambda_mmr: float = 0.7,
    limit: int = 20,
) -> List[tuple]:
    """Maximal Marginal Relevance re-ranking to improve diversity.

    Selects items that balance relevance (original score) and novelty
    (distance from already-selected items in TF-IDF space).
    Falls back to the original ranking if the model is unavailable.
    """
    try:
        from sklearn.metrics.pairwise import cosine_similarity as cos_sim
        import numpy as np

        model = get_content_model()
        id_to_idx = {mid: i for i, mid in enumerate(model.ids)}

        selected_indices: List[int] = []
        remaining = list(candidates)
        result: List[tuple] = []

        while remaining and len(result) < limit:
            best_score = -float("inf")
            best_pos = 0

            for pos, item in enumerate(remaining):
                tmdb_id = item[0]
                rel_score = float(item[1])
                idx = id_to_idx.get(tmdb_id)

                if idx is None or not selected_indices:
                    mmr = lambda_mmr * rel_score
                else:
                    item_vec = model.tfidf[idx]
                    sel_vecs = model.tfidf[selected_indices]
                    sims = cos_sim(item_vec, sel_vecs).flatten()
                    max_sim = float(np.max(sims))
                    mmr = lambda_mmr * rel_score - (1 - lambda_mmr) * max_sim

                if mmr > best_score:
                    best_score = mmr
                    best_pos = pos

            chosen = remaining.pop(best_pos)
            chosen_idx = id_to_idx.get(chosen[0])
            if chosen_idx is not None:
                selected_indices.append(chosen_idx)
            result.append(chosen)

        return result
    except Exception:
        # Graceful degradation: return top-N without MMR
        return candidates[:limit]


def _filter_disliked(
    candidates: List[tuple],
    disliked: Set[int],
) -> List[tuple]:
    return [c for c in candidates if c[0] not in disliked]


# ---------------------------------------------------------------------------
# Main recommendation functions
# ---------------------------------------------------------------------------

def recommend_for_you(req: ForYouRequest) -> ForYouResponse:
    liked = [i.tmdb_id for i in req.profile.interactions if i.value == 1]
    disliked = {i.tmdb_id for i in req.profile.interactions if i.value == -1}

    min_collab = int(os.getenv("COLLAB_MIN_INTERACTIONS", "8"))
    mmr_lambda = float(os.getenv("MMR_LAMBDA", "0.7"))

    # ---- Collaborative branch -----------------------------------------
    if len(req.profile.interactions) >= min_collab:
        raw = recommend_for_user(req.profile.user_id, liked_item_ids=liked, limit=req.limit * 4)
        raw = _filter_disliked(raw, disliked)
        ranked = _mmr_rerank(raw, lambda_mmr=mmr_lambda, limit=req.limit)
        strategy = "collaborative_svd"

        out: List[Recommendation] = []
        for tmdb_id, score in ranked:
            out.append(
                Recommendation(
                    tmdb_id=tmdb_id,
                    media_type=get_media_type(tmdb_id),
                    score=float(score),
                    explanation=None,
                )
            )
        return ForYouResponse(strategy=strategy, recommendations=out)

    # ---- Cold-start: content-based ------------------------------------
    strategy = "content_tfidf"
    if not liked:
        return ForYouResponse(strategy=strategy, recommendations=[])

    raw_cb = recommend_from_profile(liked, limit=req.limit * 4)
    raw_cb = [(t, s, seed) for t, s, seed in raw_cb if t not in disliked]
    ranked_cb = _mmr_rerank([(t, s, seed) for t, s, seed in raw_cb], lambda_mmr=mmr_lambda, limit=req.limit)

    out2: List[Recommendation] = []
    for item in ranked_cb:
        tmdb_id, score, because_seed = item[0], item[1], item[2]
        out2.append(
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Рекомендуем, потому что вам понравилось {because_seed}",
            )
        )

    return ForYouResponse(strategy=strategy, recommendations=out2)


def recommend_because(req: BecauseRequest) -> RecommendResponse:
    mmr_lambda = float(os.getenv("MMR_LAMBDA", "0.7"))
    raw = recommend_similar(req.seed.tmdb_id, limit=req.limit * 3)
    ranked = _mmr_rerank(raw, lambda_mmr=mmr_lambda, limit=req.limit)

    return RecommendResponse(
        strategy="content_because_tfidf",
        recommendations=[
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Похоже на {req.seed.tmdb_id} по жанрам/описанию/актёрам",
            )
            for tmdb_id, score in ranked
        ],
    )


def recommend_mood(req: MoodRequest) -> RecommendResponse:
    mood_queries = {
        "fun": "funny comedy uplifting feel good friendship adventure humor animated",
        "sad": "sad drama emotional bittersweet tragedy loss grief melancholy",
        "tense": "tense thriller suspense crime mystery survival psychological dark",
        "chill": "calm cozy relaxing slice of life feel good warm peaceful quiet",
        "romantic": "romance love relationship romantic drama passion couple wedding",
        "action": "action adventure hero battle fight explosion war military",
        "horror": "horror scary ghost supernatural fear monsters haunted jump scare",
    }

    query = mood_queries.get(req.mood)
    if not query:
        return RecommendResponse(strategy="mood", recommendations=[])

    mmr_lambda = float(os.getenv("MMR_LAMBDA", "0.7"))
    raw = recommend_by_text(query, limit=req.limit * 3)
    ranked = _mmr_rerank(raw, lambda_mmr=mmr_lambda, limit=req.limit)

    mood_labels = {
        "fun": "комедийное",
        "sad": "грустное",
        "tense": "напряженное",
        "chill": "спокойное",
        "romantic": "романтическое",
        "action": "боевик/экшен",
        "horror": "ужасы",
    }

    return RecommendResponse(
        strategy=f"mood_{req.mood}_content_query",
        recommendations=[
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Под настроение: {mood_labels.get(req.mood, req.mood)}",
            )
            for tmdb_id, score in ranked
        ],
    )


def recommend_similar_users(req: SimilarUsersRequest) -> SimilarUsersResponse:
    liked = [i.tmdb_id for i in req.profile.interactions if i.value == 1]
    disliked = {i.tmdb_id for i in req.profile.interactions if i.value == -1}
    mmr_lambda = float(os.getenv("MMR_LAMBDA", "0.7"))

    raw, neighbor_count = recommend_from_similar_users(
        user_id=req.profile.user_id,
        liked_item_ids=liked,
        limit=req.limit * 4,
        k_neighbors=30,
    )

    raw = _filter_disliked(raw, disliked)
    ranked = _mmr_rerank(raw, lambda_mmr=mmr_lambda, limit=req.limit)

    out: List[Recommendation] = []
    for tmdb_id, score in ranked:
        out.append(
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation="Рекомендуем, потому что это нравится пользователям с похожим вкусом",
            )
        )

    return SimilarUsersResponse(
        strategy="user_user_cf",
        recommendations=out,
        neighbor_count=int(neighbor_count),
    )
