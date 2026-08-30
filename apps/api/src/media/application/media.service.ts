import { createHash } from 'node:crypto';
import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { VehicleDocument, VehicleDocumentType, VehicleImage } from '@prisma/client';
import { VehicleRepository } from '../../fleet/infrastructure/vehicle.repository';
import {
  isSupportedDocumentContentType,
  isSupportedImageContentType,
  MAX_DOCUMENT_BYTES,
  MAX_GALLERY_IMAGES,
  MAX_IMAGE_BYTES,
  MediaErrorCode,
  SIGNED_URL_TTL_SECONDS,
  TITLE_MAX,
} from '../domain/media-rules';
import { MediaRepository } from '../infrastructure/media.repository';
import { ObjectStorage } from '../ports/object-storage.port';

export interface UploadInput {
  data: Buffer;
  contentType: string;
  sizeBytes: number;
}

/**
 * Vehicle media use-cases (03-C).
 *
 * Private-object policy (03-C03): media is uploaded to private storage,
 * metadata lives in PostgreSQL, and clients receive only short-lived signed
 * URLs (03-C08). Uploads are validated (03-C09) and tenant-scoped through
 * the vehicle's agency; gallery ordering and the primary image are enforced
 * transactionally (03-C05); document expiry is validated server-side
 * (03-C07).
 */
@Injectable()
export class MediaService {
  constructor(
    private readonly repository: MediaRepository,
    private readonly vehicles: VehicleRepository,
    private readonly storage: ObjectStorage,
  ) {}

  async uploadImage(tenantId: string, vehicleId: string, file: UploadInput): Promise<VehicleImage> {
    const vehicle = await this.requireVehicle(tenantId, vehicleId);
    if (!isSupportedImageContentType(file.contentType)) {
      throw this.uploadFailure(
        'contentType: only image/jpeg, image/png and image/webp are allowed',
      );
    }
    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_IMAGE_BYTES) {
      throw this.uploadFailure('sizeBytes: image must be between 1 byte and 10 MB');
    }
    if (file.data.length !== file.sizeBytes) {
      throw this.uploadFailure('sizeBytes: does not match the uploaded data');
    }
    const count = await this.repository.countImages(vehicleId);
    if (count >= MAX_GALLERY_IMAGES) {
      throw this.uploadFailure(`gallery: at most ${MAX_GALLERY_IMAGES} images per vehicle`);
    }

    const { objectKey } = await this.storage.upload({
      tenantId,
      vehicleId,
      kind: 'image',
      data: file.data,
      contentType: file.contentType,
    });

    const image = await this.repository.addImage({
      vehicleId: vehicle.id,
      objectKey,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      checksumSha256: sha256(file.data),
      position: count,
      isPrimary: count === 0,
    });
    return image;
  }

  async listImages(tenantId: string, vehicleId: string): Promise<VehicleImage[]> {
    await this.requireVehicle(tenantId, vehicleId);
    return this.repository.listImages(vehicleId);
  }

  /** Signed access (03-C08): the only way clients read gallery content. */
  async signedImageUrl(
    tenantId: string,
    vehicleId: string,
    imageId: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    await this.requireVehicle(tenantId, vehicleId);
    const image = await this.repository.findImage(imageId);
    if (!image || image.vehicleId !== vehicleId) {
      throw new NotFoundException({
        code: MediaErrorCode.IMAGE_NOT_FOUND,
        message: 'Image not found.',
      });
    }
    const url = await this.storage.createSignedDownloadUrl(image.objectKey, SIGNED_URL_TTL_SECONDS);
    return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000) };
  }

  /** Primary image assignment (03-C05). */
  async setPrimaryImage(
    tenantId: string,
    vehicleId: string,
    imageId: string,
  ): Promise<VehicleImage[]> {
    await this.requireVehicle(tenantId, vehicleId);
    const image = await this.repository.findImage(imageId);
    if (!image || image.vehicleId !== vehicleId) {
      throw new NotFoundException({
        code: MediaErrorCode.IMAGE_NOT_FOUND,
        message: 'Image not found.',
      });
    }
    await this.repository.setPrimaryImage(vehicleId, imageId);
    return this.repository.listImages(vehicleId);
  }

  /** Gallery ordering (03-C05). */
  async reorderImages(
    tenantId: string,
    vehicleId: string,
    orderedIds: string[],
  ): Promise<VehicleImage[]> {
    await this.requireVehicle(tenantId, vehicleId);
    const current = await this.repository.listImages(vehicleId);
    const currentIds = new Set(current.map((image) => image.id));
    if (orderedIds.length !== current.length || orderedIds.some((id) => !currentIds.has(id))) {
      throw new ConflictException({
        code: MediaErrorCode.UPLOAD_VALIDATION_FAILED,
        message: 'gallery: ordering must include every image exactly once',
      });
    }
    await this.repository.reorderImages(orderedIds);
    return this.repository.listImages(vehicleId);
  }

  async deleteImage(tenantId: string, vehicleId: string, imageId: string): Promise<void> {
    await this.requireVehicle(tenantId, vehicleId);
    const image = await this.repository.findImage(imageId);
    if (!image || image.vehicleId !== vehicleId) {
      throw new NotFoundException({
        code: MediaErrorCode.IMAGE_NOT_FOUND,
        message: 'Image not found.',
      });
    }
    const deleted = await this.repository.deleteImage(imageId);
    await this.storage.delete(deleted.objectKey);
  }

  async uploadDocument(
    tenantId: string,
    vehicleId: string,
    file: UploadInput,
    meta: { type: VehicleDocumentType; title: string; issuedAt?: string; expiresAt?: string },
  ): Promise<VehicleDocument> {
    const vehicle = await this.requireVehicle(tenantId, vehicleId);
    if (!isSupportedDocumentContentType(file.contentType)) {
      throw new ConflictException({
        code: MediaErrorCode.DOCUMENT_VALIDATION_FAILED,
        message: 'contentType: only pdf, jpeg, png and webp are allowed',
      });
    }
    if (file.sizeBytes <= 0 || file.sizeBytes > MAX_DOCUMENT_BYTES) {
      throw new ConflictException({
        code: MediaErrorCode.DOCUMENT_VALIDATION_FAILED,
        message: 'sizeBytes: document must be between 1 byte and 20 MB',
      });
    }
    if (
      typeof meta.title !== 'string' ||
      meta.title.trim().length === 0 ||
      meta.title.trim().length > TITLE_MAX
    ) {
      throw new ConflictException({
        code: MediaErrorCode.DOCUMENT_VALIDATION_FAILED,
        message: `title: must be 1-${TITLE_MAX} characters`,
      });
    }
    const issuedAt = meta.issuedAt ? new Date(meta.issuedAt) : null;
    const expiresAt = meta.expiresAt ? new Date(meta.expiresAt) : null;
    // Expiry rules (03-C07): expiry must come after issuance.
    if (issuedAt && expiresAt && expiresAt < issuedAt) {
      throw new ConflictException({
        code: MediaErrorCode.DOCUMENT_VALIDATION_FAILED,
        message: 'expiresAt: must not be before issuedAt',
      });
    }

    const { objectKey } = await this.storage.upload({
      tenantId,
      vehicleId,
      kind: 'document',
      data: file.data,
      contentType: file.contentType,
    });

    return this.repository.addDocument({
      vehicleId: vehicle.id,
      type: meta.type,
      title: meta.title.trim(),
      objectKey,
      contentType: file.contentType,
      sizeBytes: file.sizeBytes,
      issuedAt,
      expiresAt,
    });
  }

  async listDocuments(
    tenantId: string,
    vehicleId: string,
  ): Promise<Array<VehicleDocument & { expired: boolean }>> {
    await this.requireVehicle(tenantId, vehicleId);
    const documents = await this.repository.listDocuments(vehicleId);
    const now = Date.now();
    return documents.map((document) => ({
      ...document,
      expired: document.expiresAt !== null && document.expiresAt.getTime() < now,
    }));
  }

  async signedDocumentUrl(
    tenantId: string,
    vehicleId: string,
    documentId: string,
  ): Promise<{ url: string; expiresAt: Date }> {
    await this.requireVehicle(tenantId, vehicleId);
    const document = await this.repository.findDocument(documentId);
    if (!document || document.vehicleId !== vehicleId) {
      throw new NotFoundException({
        code: MediaErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    const url = await this.storage.createSignedDownloadUrl(
      document.objectKey,
      SIGNED_URL_TTL_SECONDS,
    );
    return { url, expiresAt: new Date(Date.now() + SIGNED_URL_TTL_SECONDS * 1000) };
  }

  async deleteDocument(tenantId: string, vehicleId: string, documentId: string): Promise<void> {
    await this.requireVehicle(tenantId, vehicleId);
    const document = await this.repository.findDocument(documentId);
    if (!document || document.vehicleId !== vehicleId) {
      throw new NotFoundException({
        code: MediaErrorCode.DOCUMENT_NOT_FOUND,
        message: 'Document not found.',
      });
    }
    const deleted = await this.repository.deleteDocument(documentId);
    await this.storage.delete(deleted.objectKey);
  }

  private async requireVehicle(
    tenantId: string,
    vehicleId: string,
  ): Promise<{ id: string; tenantId: string }> {
    const vehicle = await this.vehicles.findById(vehicleId);
    if (!vehicle || vehicle.tenantId !== tenantId) {
      throw new NotFoundException({
        code: MediaErrorCode.VEHICLE_NOT_FOUND,
        message: 'Vehicle not found.',
      });
    }
    return vehicle;
  }

  private uploadFailure(message: string): ConflictException {
    return new ConflictException({
      code: MediaErrorCode.UPLOAD_VALIDATION_FAILED,
      message,
    });
  }
}

function sha256(data: Buffer): string {
  return createHash('sha256').update(data).digest('hex');
}
