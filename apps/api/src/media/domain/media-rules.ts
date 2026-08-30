/**
 * Vehicle media/document rules (03-C).
 */
export const MediaErrorCode = {
  VEHICLE_NOT_FOUND: 'VEHICLE_NOT_FOUND',
  IMAGE_NOT_FOUND: 'IMAGE_NOT_FOUND',
  DOCUMENT_NOT_FOUND: 'DOCUMENT_NOT_FOUND',
  UPLOAD_VALIDATION_FAILED: 'UPLOAD_VALIDATION_FAILED',
  DOCUMENT_VALIDATION_FAILED: 'DOCUMENT_VALIDATION_FAILED',
} as const;

export type MediaErrorCodeValue = (typeof MediaErrorCode)[keyof typeof MediaErrorCode];

/** Image formats accepted for the vehicle gallery (03-C09). */
export const IMAGE_CONTENT_TYPES: ReadonlySet<string> = new Set<string>([
  'image/jpeg',
  'image/png',
  'image/webp',
]);

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB
export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024; // 20 MB
export const MAX_GALLERY_IMAGES = 12;
export const TITLE_MAX = 120;

/** Document formats accepted (PDF + common images). */
export const DOCUMENT_CONTENT_TYPES: ReadonlySet<string> = new Set<string>([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
]);

/** Signed download URL lifetime (03-C08). */
export const SIGNED_URL_TTL_SECONDS = 15 * 60;

export function isSupportedImageContentType(contentType: string): boolean {
  return IMAGE_CONTENT_TYPES.has(contentType);
}

export function isSupportedDocumentContentType(contentType: string): boolean {
  return DOCUMENT_CONTENT_TYPES.has(contentType);
}
