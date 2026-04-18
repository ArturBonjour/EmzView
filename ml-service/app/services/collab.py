from __future__ import annotations

from dataclasses import dataclass
from typing import List, Tuple

import numpy as np

from sklearn.metrics.pairwise import cosine_similarity

from app.services.data import load_ratings_matrix


@dataclass
class CollabModel:
    user_ids: List[str]
    item_ids: List[int]
    user_factors: np.ndarray
    item_factors: np.ndarray


_COLLAB_MODEL: CollabModel | None = None


def get_collab_model(k: int = 32) -> CollabModel:
    global _COLLAB_MODEL
    if _COLLAB_MODEL is not None:
        return _COLLAB_MODEL

    user_ids, item_ids, mat = load_ratings_matrix()

    if mat.size == 0:
        _COLLAB_MODEL = CollabModel(user_ids=[], item_ids=[], user_factors=np.zeros((0, k)), item_factors=np.zeros((0, k)))
        return _COLLAB_MODEL

    U, s, Vt = np.linalg.svd(mat, full_matrices=False)

    kk = min(k, len(s))
    user_factors = U[:, :kk] * s[:kk]
    item_factors = Vt[:kk, :].T

    _COLLAB_MODEL = CollabModel(user_ids=user_ids, item_ids=item_ids, user_factors=user_factors, item_factors=item_factors)
    return _COLLAB_MODEL


def recommend_for_user(user_id: str, liked_item_ids: List[int], limit: int = 20) -> List[Tuple[int, float]]:
    model = get_collab_model()
    if user_id not in model.user_ids:
        return []

    uidx = model.user_ids.index(user_id)
    scores = model.user_factors[uidx] @ model.item_factors.T

    liked_set = set(liked_item_ids)
    out = []
    for j, item_id in enumerate(model.item_ids):
        if item_id in liked_set:
            continue
        out.append((item_id, float(scores[j])))

    out.sort(key=lambda x: x[1], reverse=True)
    return out[:limit]


def recommend_from_similar_users(user_id: str, liked_item_ids: List[int], limit: int = 20, k_neighbors: int = 30) -> Tuple[List[Tuple[int, float]], int]:
    """User-user CF.

    Returns:
      - recommendations: list of (tmdb_id, score)
      - neighbor_count: number of neighbors effectively used
    """

    user_ids, item_ids, mat = load_ratings_matrix()
    if mat.size == 0 or user_id not in user_ids:
        return [], 0

    uidx = user_ids.index(user_id)
    user_vec = mat[uidx : uidx + 1]

    sims = cosine_similarity(user_vec, mat).flatten()
    sims[uidx] = -1.0

    neighbor_idx = np.argsort(-sims)[:k_neighbors]
    neighbor_idx = [int(i) for i in neighbor_idx if sims[int(i)] > 0]
    if not neighbor_idx:
        return [], 0

    liked_set = set(liked_item_ids)
    scores = {}

    for n in neighbor_idx:
        w = float(sims[n])
        if w <= 0:
            continue
        row = mat[n]
        liked_by_neighbor = np.where(row > 0)[0]
        for j in liked_by_neighbor:
            item_id = int(item_ids[int(j)])
            if item_id in liked_set:
                continue
            scores[item_id] = scores.get(item_id, 0.0) + w

    out = [(mid, float(score)) for mid, score in scores.items()]
    out.sort(key=lambda x: x[1], reverse=True)
    return out[:limit], len(neighbor_idx)
