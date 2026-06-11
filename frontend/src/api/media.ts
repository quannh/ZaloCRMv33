/**
 * media.ts — API client cho Kho phương tiện (Phase Media Library 2026-06-11).
 */
import { api } from './index';

export interface MediaAssetItem {
  id: string;
  kind: 'image' | 'video' | 'file';
  name: string;
  visibility: 'private' | 'public';
  ownerUserId: string | null;
  tagIds: string[];
  usageCount: number;
  url: string | null;
  thumbnailUrl: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

export interface ListMediaParams {
  kind?: string;
  tag?: string;
  folderId?: string;
  visibility?: string;
  q?: string;
  limit?: number;
}

/** Liệt kê kho (scope theo owner + visibility ở backend). */
export async function listMedia(params: ListMediaParams = {}): Promise<MediaAssetItem[]> {
  const { data } = await api.get('/media', { params });
  return data.items as MediaAssetItem[];
}

/** Tải tệp lên kho (multipart). */
export async function uploadMedia(
  files: File[],
  opts: { visibility?: 'private' | 'public'; folderId?: string; tagIds?: string[] } = {},
): Promise<{ assets: Array<{ id: string; name: string; deduped: boolean }> }> {
  const form = new FormData();
  for (const f of files) form.append('files', f);
  if (opts.visibility) form.append('visibility', opts.visibility);
  if (opts.folderId) form.append('folderId', opts.folderId);
  if (opts.tagIds) form.append('tagIds', JSON.stringify(opts.tagIds));
  const { data } = await api.post('/media/upload', form);
  return data;
}

/** Lưu 1 tin nhắn (ảnh/file khách hoặc mình gửi) vào kho. */
export async function saveFromChat(
  messageId: string,
  visibility?: 'private' | 'public',
): Promise<{ asset: { id: string; name: string }; deduped: boolean }> {
  const { data } = await api.post('/media/save-from-chat', { messageId, visibility });
  return data;
}

/** Chèn 1 asset từ kho vào 1 hội thoại (gửi đi). */
export async function sendMediaToConversation(
  assetId: string,
  conversationId: string,
  caption?: string,
): Promise<{ message: unknown }> {
  const { data } = await api.post(`/media/${assetId}/send`, { conversationId, caption });
  return data;
}
