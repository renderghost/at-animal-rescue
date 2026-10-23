/**
 * Photo and video limits, shared by the server and the editor (kept free of dependencies for
 * the browser bundle).
 */
export const PHOTO_LIMITS = {
  /** Photos per animal, as in the lexicon. */
  count: 12,
  /** Longest side after resizing, in pixels; the browser shrinks to this before uploading. */
  maxSide: 2000,
  /** What we accept from a browser without JavaScript (full-size phone photos). */
  uploadBytes: 15 * 1024 * 1024,
  /** The lexicon's limit for a stored photo, with a little headroom. */
  storedBytes: 1_900_000,
  alt: 1000,
} as const;

export const MAX_VIDEOS = 6;
