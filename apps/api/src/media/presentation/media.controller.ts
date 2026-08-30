import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { VehicleDocumentType } from '@prisma/client';
import { PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import { MediaService } from '../application/media.service';

function toImageResponse(image: {
  id: string;
  vehicleId: string;
  contentType: string;
  sizeBytes: number;
  checksumSha256: string | null;
  position: number;
  isPrimary: boolean;
  createdAt: Date;
}): unknown {
  return {
    id: image.id,
    vehicleId: image.vehicleId,
    contentType: image.contentType,
    sizeBytes: image.sizeBytes,
    checksumSha256: image.checksumSha256,
    position: image.position,
    isPrimary: image.isPrimary,
    createdAt: image.createdAt.toISOString(),
  };
}

function toDocumentResponse(document: {
  id: string;
  vehicleId: string;
  type: string;
  title: string;
  contentType: string;
  sizeBytes: number;
  issuedAt: Date | null;
  expiresAt: Date | null;
  createdAt: Date;
  expired?: boolean;
}): unknown {
  return {
    id: document.id,
    vehicleId: document.vehicleId,
    type: document.type,
    title: document.title,
    contentType: document.contentType,
    sizeBytes: document.sizeBytes,
    issuedAt: document.issuedAt ? document.issuedAt.toISOString().slice(0, 10) : null,
    expiresAt: document.expiresAt ? document.expiresAt.toISOString().slice(0, 10) : null,
    expired: document.expired ?? false,
    createdAt: document.createdAt.toISOString(),
  };
}

/**
 * Vehicle media/document endpoints (03-C). Private by default: responses
 * carry metadata only; binary content is read exclusively through the
 * signed-URL endpoints (03-C08).
 */
@Controller('agencies/:agencyId/vehicles/:vehicleId')
export class MediaController {
  constructor(private readonly service: MediaService) {}

  @Post('images')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async uploadImage(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @UploadedFile() file?: { buffer: Buffer; mimetype: string; size: number },
  ): Promise<unknown> {
    if (!file) {
      return this.service
        .listImages(agencyId, vehicleId)
        .then((images) => ({ images: images.map(toImageResponse) }));
    }
    const image = await this.service.uploadImage(agencyId, vehicleId, {
      data: file.buffer,
      contentType: file.mimetype,
      sizeBytes: file.size,
    });
    return toImageResponse(image);
  }

  @Get('images')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async listImages(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<unknown> {
    const images = await this.service.listImages(agencyId, vehicleId);
    return { images: images.map(toImageResponse) };
  }

  @Get('images/:imageId/url')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async imageUrl(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string,
  ): Promise<unknown> {
    const signed = await this.service.signedImageUrl(agencyId, vehicleId, imageId);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  @Patch('images/:imageId/primary')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async setPrimary(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string,
  ): Promise<unknown> {
    const images = await this.service.setPrimaryImage(agencyId, vehicleId, imageId);
    return { images: images.map(toImageResponse) };
  }

  @Patch('images/order')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async reorder(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Body() body: { orderedIds: string[] },
  ): Promise<unknown> {
    const images = await this.service.reorderImages(agencyId, vehicleId, body.orderedIds);
    return { images: images.map(toImageResponse) };
  }

  @Delete('images/:imageId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async deleteImage(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('imageId') imageId: string,
  ): Promise<unknown> {
    await this.service.deleteImage(agencyId, vehicleId, imageId);
    return { deleted: true };
  }

  @Post('documents')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 20 * 1024 * 1024 } }))
  async uploadDocument(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @UploadedFile() file: { buffer: Buffer; mimetype: string; size: number },
    @Body()
    body: { type: VehicleDocumentType; title: string; issuedAt?: string; expiresAt?: string },
  ): Promise<unknown> {
    const document = await this.service.uploadDocument(
      agencyId,
      vehicleId,
      {
        data: file.buffer,
        contentType: file.mimetype,
        sizeBytes: file.size,
      },
      {
        type: body.type,
        title: body.title,
        issuedAt: body.issuedAt,
        expiresAt: body.expiresAt,
      },
    );
    return toDocumentResponse(document);
  }

  @Get('documents')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async listDocuments(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
  ): Promise<unknown> {
    const documents = await this.service.listDocuments(agencyId, vehicleId);
    return { documents: documents.map(toDocumentResponse) };
  }

  @Get('documents/:documentId/url')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_READ)
  async documentUrl(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<unknown> {
    const signed = await this.service.signedDocumentUrl(agencyId, vehicleId, documentId);
    return { url: signed.url, expiresAt: signed.expiresAt.toISOString() };
  }

  @Delete('documents/:documentId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.VEHICLE_UPDATE)
  async deleteDocument(
    @Param('agencyId') agencyId: string,
    @Param('vehicleId') vehicleId: string,
    @Param('documentId') documentId: string,
  ): Promise<unknown> {
    await this.service.deleteDocument(agencyId, vehicleId, documentId);
    return { deleted: true };
  }
}
