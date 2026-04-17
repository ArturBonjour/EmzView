import mongoose from 'mongoose';

const watchlistSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tmdbId: { type: Number, required: true },
    mediaType: { type: String, enum: ['movie', 'tv'], required: true },
  },
  { timestamps: true }
);

watchlistSchema.index({ userId: 1, tmdbId: 1, mediaType: 1 }, { unique: true });

export const Watchlist = mongoose.model('Watchlist', watchlistSchema);
