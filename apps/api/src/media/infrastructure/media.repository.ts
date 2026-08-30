import { Injectable } from '@nestjs/common';
import { VehicleDocument, VehicleDocumentType, VehicleImage } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Vehicle gallery/document persistence (03-C04/05/06/07).
 */
@Injectable()
export class MediaRepository {
  constructor(private readonly prisma: PrismaService) {}

  async addImage(input: {
    vehicleId: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    checksumSha256: string | null;
    position: number;
    isPrimary: boolean;
  }): Promise<VehicleImage> {
    return this.prisma.vehicleImage.create({ data: input });
  }

  async listImages(vehicleId: string): Promise<VehicleImage[]> {
    return this.prisma.vehicleImage.findMany({
      where: { vehicleId },
      orderBy: [{ position: 'asc' }, { createdAt: 'asc' }],
    });
  }

  async findImage(id: string): Promise<VehicleImage | undefined> {
    const image = await this.prisma.vehicleImage.findUnique({ where: { id } });
    return image ?? undefined;
  }

  async countImages(vehicleId: string): Promise<number> {
    return this.prisma.vehicleImage.count({ where: { vehicleId } });
  }

  /** Clear + reassign the primary flag atomically (03-C05). */
  async setPrimaryImage(vehicleId: string, imageId: string): Promise<void> {
    await this.prisma.$transaction([
      this.prisma.vehicleImage.updateMany({ where: { vehicleId }, data: { isPrimary: false } }),
      this.prisma.vehicleImage.update({ where: { id: imageId }, data: { isPrimary: true } }),
    ]);
  }

  async reorderImages(orderedIds: string[]): Promise<void> {
    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.vehicleImage.update({ where: { id }, data: { position: index } }),
      ),
    );
  }

  async deleteImage(id: string): Promise<VehicleImage> {
    return this.prisma.vehicleImage.delete({ where: { id } });
  }

  async addDocument(input: {
    vehicleId: string;
    type: VehicleDocumentType;
    title: string;
    objectKey: string;
    contentType: string;
    sizeBytes: number;
    issuedAt: Date | null;
    expiresAt: Date | null;
  }): Promise<VehicleDocument> {
    return this.prisma.vehicleDocument.create({ data: input });
  }

  async listDocuments(vehicleId: string): Promise<VehicleDocument[]> {
    return this.prisma.vehicleDocument.findMany({
      where: { vehicleId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findDocument(id: string): Promise<VehicleDocument | undefined> {
    const document = await this.prisma.vehicleDocument.findUnique({ where: { id } });
    return document ?? undefined;
  }

  async deleteDocument(id: string): Promise<VehicleDocument> {
    return this.prisma.vehicleDocument.delete({ where: { id } });
  }
}
