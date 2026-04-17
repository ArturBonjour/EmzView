from __future__ import annotations

from typing import Dict, List, Tuple

import numpy as np

from app.services.mongo import get_mongo


def load_movies_for_content() -> Tuple[List[int], List[str], Dict[int, Dict]]:
    client = get_mongo()
    db = client.get_default_database()

    docs = list(
        db.movies.find(
            {},
            {
                "tmdbId": 1,
                "title": 1,
                "overview": 1,
                "genres": 1,
                "cast": 1,
                "keywords": 1,
                "mediaType": 1,
            },
        )
    )

    ids: List[int] = []
    texts: List[str] = []
    meta: Dict[int, Dict] = {}

    for d in docs:
        tmdb_id = int(d["tmdbId"])
        title = d.get("title", "") or ""
        overview = d.get("overview", "") or ""
        genres = " ".join([g.get("name", "") for g in (d.get("genres") or []) if g.get("name")])
        cast = " ".join([c for c in (d.get("cast") or []) if c])
        keywords = " ".join([k for k in (d.get("keywords") or []) if k])

        # Boost title (×3) and genres (×2) relative to other fields so that
        # the TF-IDF vectors emphasise the most discriminative attributes.
        text = f"{title} {title} {title} {genres} {genres} {overview} {cast} {keywords}".strip()

        ids.append(tmdb_id)
        texts.append(text)
        meta[tmdb_id] = {
            "title": title,
            "media_type": d.get("mediaType", "movie"),
        }

    return ids, texts, meta


def load_ratings_matrix() -> Tuple[List[str], List[int], np.ndarray]:
    client = get_mongo()
    db = client.get_default_database()

    ratings = list(db.ratings.find({}, {"userId": 1, "tmdbId": 1, "value": 1}))
    if not ratings:
        return [], [], np.zeros((0, 0), dtype=np.float32)

    user_ids = sorted({str(r["userId"]) for r in ratings})
    item_ids = sorted({int(r["tmdbId"]) for r in ratings})

    user_index = {u: i for i, u in enumerate(user_ids)}
    item_index = {m: j for j, m in enumerate(item_ids)}

    mat = np.zeros((len(user_ids), len(item_ids)), dtype=np.float32)

    for r in ratings:
        u = str(r["userId"])
        m = int(r["tmdbId"])
        v = float(r.get("value", 0))
        mat[user_index[u], item_index[m]] = v

    return user_ids, item_ids, mat
