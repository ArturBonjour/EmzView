from __future__ import annotations

from dataclasses import dataclass
from typing import Dict, List, Tuple

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity

from app.services.data import load_movies_for_content


@dataclass
class ContentModel:
    ids: List[int]
    tfidf: "scipy.sparse.spmatrix"
    vectorizer: TfidfVectorizer
    meta: Dict[int, Dict]


_CONTENT_MODEL: ContentModel | None = None


def get_content_model() -> ContentModel:
    global _CONTENT_MODEL
    if _CONTENT_MODEL is not None:
        return _CONTENT_MODEL

    ids, texts, meta = load_movies_for_content()

    vectorizer = TfidfVectorizer(
        max_features=50_000,
        ngram_range=(1, 2),
        stop_words="english",
    )

    tfidf = vectorizer.fit_transform(texts)

    _CONTENT_MODEL = ContentModel(ids=ids, tfidf=tfidf, vectorizer=vectorizer, meta=meta)
    return _CONTENT_MODEL


def recommend_similar(seed_tmdb_id: int, limit: int = 20) -> List[Tuple[int, float]]:
    model = get_content_model()
    id_to_index = {mid: i for i, mid in enumerate(model.ids)}
    idx = id_to_index.get(seed_tmdb_id)
    if idx is None:
        return []
    seed_vec = model.tfidf[idx]
    sims = cosine_similarity(seed_vec, model.tfidf).flatten()

    candidates = [(model.ids[i], float(sims[i])) for i in range(len(model.ids)) if model.ids[i] != seed_tmdb_id]
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[:limit]


def recommend_from_profile(liked_tmdb_ids: List[int], limit: int = 20) -> List[Tuple[int, float, int]]:
    """Returns tuples: (tmdb_id, score, because_seed_tmdb_id)."""
    model = get_content_model()

    id_to_index = {mid: i for i, mid in enumerate(model.ids)}
    liked_indices = [id_to_index[mid] for mid in liked_tmdb_ids if mid in id_to_index]
    if not liked_indices:
        return []

    profile_vec = model.tfidf[liked_indices].mean(axis=0)
    sims = cosine_similarity(profile_vec, model.tfidf).flatten()

    liked_set = set(liked_tmdb_ids)

    out: List[Tuple[int, float, int]] = []
    for i, mid in enumerate(model.ids):
        if mid in liked_set:
            continue
        out.append((mid, float(sims[i]), liked_tmdb_ids[0]))

    out.sort(key=lambda x: x[1], reverse=True)
    return out[:limit]


def recommend_by_text(query_text: str, limit: int = 20) -> List[Tuple[int, float]]:
    model = get_content_model()
    if not model.ids:
        return []

    q = (query_text or "").strip()
    if not q:
        return []

    q_vec = model.vectorizer.transform([q])
    sims = cosine_similarity(q_vec, model.tfidf).flatten()

    candidates = [(model.ids[i], float(sims[i])) for i in range(len(model.ids))]
    candidates.sort(key=lambda x: x[1], reverse=True)
    return candidates[:limit]


def get_media_type(tmdb_id: int) -> str | None:
    model = get_content_model()
    return model.meta.get(int(tmdb_id), {}).get("media_type")
