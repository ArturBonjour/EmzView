from typing import List, Optional, Literal

from pydantic import BaseModel, Field


class Interaction(BaseModel):
    tmdb_id: int
    media_type: Literal["movie", "tv"]
    value: int = Field(description="1=like, -1=dislike")


class UserProfile(BaseModel):
    user_id: str
    interactions: List[Interaction] = []


class ForYouRequest(BaseModel):
    profile: UserProfile
    limit: int = 20


class SimilarUsersRequest(BaseModel):
    profile: UserProfile
    limit: int = 20


class SeedItem(BaseModel):
    tmdb_id: int
    media_type: Literal["movie", "tv"]


class BecauseRequest(BaseModel):
    seed: SeedItem
    limit: int = 20


class MoodRequest(BaseModel):
    mood: Literal["fun", "sad", "tense", "chill"]
    limit: int = 20


class Recommendation(BaseModel):
    tmdb_id: int
    media_type: Optional[Literal["movie", "tv"]] = None
    score: float
    explanation: Optional[str] = None


class RecommendResponse(BaseModel):
    strategy: str
    recommendations: List[Recommendation]


class ForYouResponse(RecommendResponse):
    pass


class SimilarUsersResponse(RecommendResponse):
    neighbor_count: int = 0
