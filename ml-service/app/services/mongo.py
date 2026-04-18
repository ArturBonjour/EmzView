import os
from pymongo import MongoClient


def get_mongo() -> MongoClient:
    uri = os.getenv("MONGODB_URI")
    if not uri:
        raise RuntimeError("MONGODB_URI is required")
    return MongoClient(uri)
