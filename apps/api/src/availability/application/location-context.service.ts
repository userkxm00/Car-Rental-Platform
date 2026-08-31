import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { AvailabilityContext } from '../domain/availability-query';

/**
 * Location-context validation (04-C06), shared by every flow that resolves
 * pickup/return branches and delivery zones against tenant-owned records:
 * availability reads (04-C) and booking quotes (05-A).
 *
 * A referenced branch must belong to the agency; a referenced delivery zone
 * must belong to the agency and be active. Zone-based vehicle eligibility
 * itself is a spatial-phase concern — the context is carried through and
 * reported as a pending constraint, never silently applied.
 */
@Injectable()
export class LocationContextService {
  constructor(private readonly prisma: PrismaService) {}

  async resolve(
    tenantId: string,
    input: { pickupBranchId?: string; returnBranchId?: string; deliveryZoneId?: string },
  ): Promise<AvailabilityContext> {
    const context: AvailabilityContext = { ...input };
    for (const branchId of [input.pickupBranchId, input.returnBranchId]) {
      if (branchId) {
        const branch = await this.prisma.branch.findFirst({
          where: { id: branchId, tenantId },
          select: { id: true },
        });
        if (!branch) {
          throw new NotFoundException({
            code: 'BRANCH_NOT_FOUND',
            message: 'Branch not found in this agency.',
          });
        }
      }
    }
    if (input.deliveryZoneId) {
      const zone = await this.prisma.deliveryZone.findFirst({
        where: { id: input.deliveryZoneId, tenantId },
        select: { id: true, active: true },
      });
      if (!zone) {
        throw new NotFoundException({
          code: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Delivery zone not found in this agency.',
        });
      }
      if (!zone.active) {
        throw new NotFoundException({
          code: 'DELIVERY_ZONE_NOT_FOUND',
          message: 'Delivery zone is inactive.',
        });
      }
    }
    return context;
  }
}
