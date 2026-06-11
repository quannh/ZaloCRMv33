/**
 * media-service.ts — Phase Media Library 2026-06-11.
 *
 * Tầng SERVICE của kho phương tiện. Biết Prisma + orgId; gọi xuống storage
 * (uploadBuffer đã dedup theo sha256) rồi upsert MediaAsset/MediaBlob.
 *
 * Kiến trúc 2 tầng (eng review E2):
 *   storage (minio-client) → trả {contentHash, deduped, url, ...}  ← KHÔNG biết DB
 *   service (file này)     → upsert MediaAsset (danh tính) + MediaBlob (variant)
 *
 * COUPLING bắt buộc (eng review D9): kể cả khi storage dedup-hit (deduped=true),
 * service VẪN upsert MediaBlob theo [orgId,contentHash] + tăng usageCount asset,
 * nếu không các lần dedup-hit (đặc biệt mirror tin khách) sẽ không vào catalog.
 *
 * Xử lý lỗi (eng review D10):
 *   • P2002 (2 sale upload cùng bytes đồng thời) → coi như dedup-hit, đọc lại bản có sẵn.
 *   • sharp lỗi (ảnh hỏng/format lạ) → fallback lưu ảnh GỐC + log warn (compressImage).
 */
import sharp from 'sharp';
import { imageSize } from 'image-size';
import { prisma } from '../../shared/database/prisma-client.js';
import { uploadBuffer } from '../../shared/storage/minio-client.js';
import { logger } from '../../shared/utils/logger.js';
import type { MediaAsset, MediaBlob } from '@prisma/client';

const IMAGE_MIMES = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif']);
// Ngưỡng nén: cạnh dài tối đa + chất lượng webp. Ảnh bảng giá/mặt bằng giữ rõ chữ.
const MAX_EDGE = 2000;
const WEBP_QUALITY = 82;
// GIF (ảnh động) KHÔNG nén qua sharp (mất animation) — giữ nguyên.
const COMPRESSIBLE = new Set(['image/jpeg', 'image/png', 'image/webp']);

export type MediaKind = 'image' | 'video' | 'file';
export type MediaSource = 'upload' | 'saved_from_chat';

export interface RegisterAssetInput {
  orgId: string;
  buffer: Buffer;
  mimeType: string;
  /** Phân loại để route nén/thumbnail. */
  kind: MediaKind;
  /** Tên hiển thị trong kho (mặc định = originalFilename). */
  name?: string;
  originalFilename?: string;
  ownerUserId?: string | null;
  createdById?: string | null;
  /** 'private' (mặc định, fail-closed) | 'public'. */
  visibility?: 'private' | 'public';
  source?: MediaSource;
  /** Nếu lưu từ chat của nick Riêng tư → nick nguồn (enforce redact privacy). */
  sourceZaloAccountId?: string | null;
  tagIds?: string[];
  folderId?: string | null;
}

export interface RegisterAssetResult {
  asset: MediaAsset;
  blob: MediaBlob;
  /** true nếu bytes đã tồn tại từ trước (không tốn thêm ô lưu trữ MinIO). */
  deduped: boolean;
}

/**
 * Nén ảnh (sharp): resize cạnh dài về MAX_EDGE, encode webp chất lượng cao.
 * D10(2): sharp lỗi (ảnh hỏng/format lạ) → fallback trả buffer GỐC + log warn.
 * GIF/video/file → trả nguyên bytes (không nén qua sharp).
 *
 * @returns { buffer, mimeType, width?, height?, compressed }
 */
export async function compressImage(
  buffer: Buffer,
  mimeType: string,
): Promise<{ buffer: Buffer; mimeType: string; width?: number; height?: number; compressed: boolean }> {
  if (!COMPRESSIBLE.has(mimeType)) {
    // GIF / non-image → giữ nguyên, chỉ đọc kích thước nếu là ảnh.
    let w: number | undefined;
    let h: number | undefined;
    if (IMAGE_MIMES.has(mimeType)) {
      try {
        const dim = imageSize(buffer);
        w = dim.width;
        h = dim.height;
      } catch { /* ảnh không đọc được dimension — bỏ qua */ }
    }
    return { buffer, mimeType, width: w, height: h, compressed: false };
  }
  try {
    const img = sharp(buffer, { failOn: 'error' });
    const meta = await img.metadata();
    const needResize = (meta.width ?? 0) > MAX_EDGE || (meta.height ?? 0) > MAX_EDGE;
    let pipeline = img.rotate(); // tôn trọng EXIF orientation
    if (needResize) {
      pipeline = pipeline.resize(MAX_EDGE, MAX_EDGE, { fit: 'inside', withoutEnlargement: true });
    }
    const out = await pipeline.webp({ quality: WEBP_QUALITY }).toBuffer({ resolveWithObject: true });
    return {
      buffer: out.data,
      mimeType: 'image/webp',
      width: out.info.width,
      height: out.info.height,
      compressed: true,
    };
  } catch (err) {
    // D10(2): không để mất ảnh — fallback bản gốc.
    logger.warn('[media] compressImage failed, fallback to original:', (err as Error)?.message ?? err);
    return { buffer, mimeType, compressed: false };
  }
}

/**
 * Đăng ký 1 media vào kho: nén (nếu ảnh) → upload dedup → upsert Asset+Blob.
 *
 * Dedup ở 2 tầng:
 *   1. Storage: uploadBuffer skip putObject nếu object đã tồn tại (deduped).
 *   2. DB: upsert MediaBlob theo [orgId,contentHash]; nếu trùng → đọc lại,
 *      tăng usageCount của asset đang trỏ tới (KHÔNG tạo asset mới).
 */
export async function registerAsset(input: RegisterAssetInput): Promise<RegisterAssetResult> {
  const {
    orgId,
    mimeType,
    kind,
    ownerUserId = null,
    createdById = null,
    visibility = 'private',
    source = 'upload',
    sourceZaloAccountId = null,
    tagIds = [],
    folderId = null,
  } = input;

  // 1. Nén (chỉ ảnh) — variant 'original' đã-nén là bytes thật lưu.
  const processed = kind === 'image'
    ? await compressImage(input.buffer, mimeType)
    : { buffer: input.buffer, mimeType, width: undefined, height: undefined, compressed: false };

  const originalFilename = input.originalFilename ?? null;
  const name = input.name ?? originalFilename ?? 'Media';

  // 2. Upload dedup → contentHash của bytes THẬT LƯU.
  const up = await uploadBuffer(processed.buffer, processed.mimeType, originalFilename ?? undefined);

  // 3. Đã có blob với contentHash này trong org? → dedup-hit ở tầng DB.
  const existingBlob = await prisma.mediaBlob.findUnique({
    where: { orgId_contentHash: { orgId, contentHash: up.contentHash } },
    include: { asset: true },
  });
  if (existingBlob) {
    // Tăng lượt dùng asset đang sở hữu blob này (catalog vẫn cập nhật khi dedup-hit).
    const asset = await prisma.mediaAsset.update({
      where: { id: existingBlob.assetId },
      data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
    });
    return { asset, blob: existingBlob, deduped: true };
  }

  // 4. Tạo Asset (danh tính) + Blob (variant original) trong 1 transaction.
  try {
    const result = await prisma.$transaction(async (tx) => {
      const asset = await tx.mediaAsset.create({
        data: {
          orgId,
          kind,
          name,
          ownerUserId,
          createdById,
          visibility,
          source,
          sourceZaloAccountId,
          folderId,
          tagIds,
          originalFilename,
        },
      });
      const blob = await tx.mediaBlob.create({
        data: {
          orgId,
          assetId: asset.id,
          contentHash: up.contentHash,
          variantType: 'original',
          minioKey: up.key,
          publicUrl: up.url,
          mimeType: up.mimeType,
          sizeBytes: up.size,
          width: processed.width ?? null,
          height: processed.height ?? null,
        },
      });
      return { asset, blob };
    });
    return { ...result, deduped: up.deduped };
  } catch (err) {
    // D10(1): 2 sale upload cùng bytes đồng thời → 1 ăn P2002 trên [orgId,contentHash].
    // Coi như dedup-hit: đọc lại blob bản kia + tăng usageCount, KHÔNG báo lỗi 500.
    if ((err as { code?: string }).code === 'P2002') {
      const blob = await prisma.mediaBlob.findUnique({
        where: { orgId_contentHash: { orgId, contentHash: up.contentHash } },
        include: { asset: true },
      });
      if (blob) {
        const asset = await prisma.mediaAsset.update({
          where: { id: blob.assetId },
          data: { usageCount: { increment: 1 }, lastUsedAt: new Date() },
        });
        return { asset, blob, deduped: true };
      }
    }
    throw err;
  }
}

/**
 * Quyết định visibility + có chặn không khi "Lưu vào Media" từ chat (privacy guard).
 * Hàm THUẦN (không DB) để test được rule bảo mật — khu vực đã từng lộ.
 *
 * Rule (eng review D11 + checklist điều 4):
 *  • Nick Riêng tư (privacyMode='main'):
 *      - viewer KHÔNG phải chủ nick → CHẶN (blocked=true).
 *      - viewer là chủ nick → cho lưu nhưng LUÔN private (kể cả xin public).
 *  • Nick Thường (sub/khác): theo lựa chọn của sale (requested ?? 'private').
 */
export function resolveSavedVisibility(args: {
  nickPrivacyMode: string | null | undefined;
  nickOwnerUserId: string | null | undefined;
  viewerUserId: string;
  requested?: 'private' | 'public';
}): { blocked: boolean; visibility: 'private' | 'public'; forcedPrivate: boolean } {
  const isPrivateNick = args.nickPrivacyMode === 'main';
  if (isPrivateNick) {
    if (args.nickOwnerUserId !== args.viewerUserId) {
      return { blocked: true, visibility: 'private', forcedPrivate: true };
    }
    // chủ nick lưu được nhưng ép private (không cho public lộ PII khách).
    return { blocked: false, visibility: 'private', forcedPrivate: true };
  }
  return { blocked: false, visibility: args.requested ?? 'private', forcedPrivate: false };
}

/**
 * Tăng lượt dùng khi 1 asset được gửi đi (chèn vào chat / album).
 */
export async function bumpUsage(assetId: string): Promise<void> {
  await prisma.mediaAsset
    .update({ where: { id: assetId }, data: { usageCount: { increment: 1 }, lastUsedAt: new Date() } })
    .catch(() => { /* asset đã archive/xóa — bỏ qua */ });
}
