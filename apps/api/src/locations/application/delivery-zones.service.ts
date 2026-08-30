import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DeliveryZone } from '@prisma/client';
import { BranchErrorCode, NAME_MAX } from '../domain/branch-rules';
import { LocationsRepository } from '../infrastructure/locations.repository';

/**
 * Delivery zone baseline (02-C08).
 *
 * The polygon geometry arrives with the spatial search phase (PostGIS SQL
 * adapter boundary); this baseline owns tenant scoping, naming and the
 * active/fee-policy reference fields.
 */
@Injectable()
export class DeliveryZonesService {
  constructor(private readonly repository: LocationsRepository) {}

  async createZone(
    tenantId: string,
    input: { name: string; active?: boolean; feePolicyReference?: string },
  ): Promise<DeliveryZone> {
    if (
      typeof input.name !== 'string' ||
      input.name.trim().length === 0 ||
      input.name.trim().length > NAME_MAX
    ) {
      throw new ConflictException({
        code: BranchErrorCode.ZONE_VALIDATION_FAILED,
        message: `name: must be 1-${NAME_MAX} characters`,
      });
    }
    return this.repository.createDeliveryZone({
      tenantId,
      name: input.name.trim(),
      active: input.active,
      feePolicyReference: input.feePolicyReference,
    });
  }

  async listZones(tenantId: string): Promise<DeliveryZone[]> {
    return this.repository.listDeliveryZones(tenantId);
  }

  async setZoneActive(tenantId: string, zoneId: string, active: boolean): Promise<DeliveryZone> {
    const zones = await this.repository.listDeliveryZones(tenantId);
    const zone = zones.find((z) => z.id === zoneId);
    if (!zone) {
      throw new NotFoundException({
        code: BranchErrorCode.ZONE_VALIDATION_FAILED,
        message: 'Delivery zone not found.',
      });
    }
    return this.repository.setDeliveryZoneActive(zoneId, active);
  }
}
