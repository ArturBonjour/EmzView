import mongoose from 'mongoose';

const movieSchema = new mongoose.Schema(
  {
    tmdbId: { type: Number, required: true, index: true },
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
    title: { type: String, required: true },
    overview: { type: String, default: '' },
    posterPath: { type: String, default: null },
    genres: { type: [{ id: Number, name: String }], default: [] },
    cast: { type: [String], default: [] },
    keywords: { type: [String], default: [] },
    releaseDate: { type: String, default: null },
    popularity: { type: Number, default: 0 },
    embeddingVersion: { type: String, default: 'tfidf_v1' },
  },
  { timestamps: true }
);

movieSchema.index({ tmdbId: 1, mediaType: 1 }, { unique: true });

export const Movie = mongoose.model('Movie', movieSchema);
