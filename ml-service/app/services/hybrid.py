from __future__ import annotations

import os
from typing import List

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
from app.services.content import recommend_from_profile, recommend_similar, recommend_by_text, get_media_type
from app.services.collab import recommend_for_user, recommend_from_similar_users


def recommend_for_you(req: ForYouRequest) -> ForYouResponse:
    liked = [i.tmdb_id for i in req.profile.interactions if i.value == 1]
    disliked = {i.tmdb_id for i in req.profile.interactions if i.value == -1}

    min_collab = int(os.getenv("COLLAB_MIN_INTERACTIONS", "8"))

    if len(req.profile.interactions) >= min_collab:
        recs = recommend_for_user(req.profile.user_id, liked_item_ids=liked, limit=req.limit * 2)
        strategy = "collaborative_svd"
        out: List[Recommendation] = []
        for tmdb_id, score in recs:
            if tmdb_id in disliked:
                continue
            out.append(
                Recommendation(
                    tmdb_id=tmdb_id,
                    media_type=get_media_type(tmdb_id),
                    score=float(score),
                    explanation=None,
                )
            )
            if len(out) >= req.limit:
                break
        return ForYouResponse(strategy=strategy, recommendations=out)

    # cold-start => content-based
    strategy = "content_tfidf"

    if not liked:
        return ForYouResponse(strategy=strategy, recommendations=[])

    cb = recommend_from_profile(liked, limit=req.limit * 2)
    out2: List[Recommendation] = []
    for tmdb_id, score, because_seed in cb:
        if tmdb_id in disliked:
            continue
        out2.append(
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Рекомендуем, потому что вам понравилось {because_seed}",
            )
        )
        if len(out2) >= req.limit:
            break

    return ForYouResponse(strategy=strategy, recommendations=out2)


def recommend_because(req: BecauseRequest) -> RecommendResponse:
    sims = recommend_similar(req.seed.tmdb_id, limit=req.limit)
    return RecommendResponse(
        strategy="content_because_tfidf",
        recommendations=[
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Похоже на {req.seed.tmdb_id} по жанрам/описанию/актёрам",
            )
            for tmdb_id, score in sims
        ],
    )


def recommend_mood(req: MoodRequest) -> RecommendResponse:
    mood_queries = {
        "fun": "funny comedy uplifting feel good friendship adventure",
        "sad": "sad drama emotional bittersweet tragedy loss",
        "tense": "tense thriller suspense crime mystery survival",
        "chill": "calm cozy relaxing slice of life feel good warm peaceful",
    }

    query = mood_queries.get(req.mood)
    if not query:
        return RecommendResponse(strategy="mood", recommendations=[])

    sims = recommend_by_text(query, limit=req.limit)
    return RecommendResponse(
        strategy=f"mood_{req.mood}_content_query",
        recommendations=[
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation=f"Под настроение: {req.mood}",
            )
            for tmdb_id, score in sims
        ],
    )


def recommend_similar_users(req: SimilarUsersRequest) -> SimilarUsersResponse:
    liked = [i.tmdb_id for i in req.profile.interactions if i.value == 1]
    disliked = {i.tmdb_id for i in req.profile.interactions if i.value == -1}

    recs, neighbor_count = recommend_from_similar_users(
        user_id=req.profile.user_id,
        liked_item_ids=liked,
        limit=req.limit * 2,
        k_neighbors=30,
    )

    out: List[Recommendation] = []
    for tmdb_id, score in recs:
        if tmdb_id in disliked:
            continue
        out.append(
            Recommendation(
                tmdb_id=tmdb_id,
                media_type=get_media_type(tmdb_id),
                score=float(score),
                explanation="Рекомендуем, потому что это нравится пользователям с похожим вкусом",
            )
        )
        if len(out) >= req.limit:
            break

    return SimilarUsersResponse(
        strategy="user_user_cf",
        recommendations=out,
        neighbor_count=int(neighbor_count),
    )
