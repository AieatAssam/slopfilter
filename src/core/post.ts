export interface PostAuthor {
  handle: string;
  displayName: string;
  profileUrl: string | null;
}

export interface PostEngagement {
  replies: number | null;
  reposts: number | null;
  likes: number | null;
  views: number | null;
}

export interface Post {
  id: string;
  permalink: string | null;
  text: string;
  postedAt: string | null;
  author: PostAuthor;
  engagement: PostEngagement;
  imageUrls: readonly string[];
  hasVideo: boolean;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

export function isPost(value: unknown): value is Post {
  if (!isRecord(value)) return false;
  if (typeof value.id !== 'string' || value.id.length === 0) return false;
  if (typeof value.text !== 'string') return false;
  if (!Array.isArray(value.imageUrls) || !value.imageUrls.every((url) => typeof url === 'string')) {
    return false;
  }
  if (typeof value.hasVideo !== 'boolean') return false;
  if (!isRecord(value.author)) return false;
  if (typeof value.author.handle !== 'string' || typeof value.author.displayName !== 'string') {
    return false;
  }
  return isRecord(value.engagement);
}
