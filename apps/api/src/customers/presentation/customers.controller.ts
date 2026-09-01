import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUserId, PermissionGuard, RequirePermission } from '../../authorization/guard/permission.guard';
import { AgencyScopeGuard } from '../../authorization/scope/tenant-scope';
import { Permission } from '../../authorization/permissions';
import {
  CustomerDetailResponse,
  CustomerInput,
  CustomerListQuery,
  CustomerListResponse,
  CustomerResponse,
  DocumentInput,
  DocumentResponse,
  LinkCustomerInput,
  VerifyDocumentInput,
} from '../domain/customer-contract';
import { CustomersService } from '../application/customers.service';

/**
 * Agency customer master (07-A).
 *
 * - POST   /api/v1/agencies/:agencyId/customers — create a customer record.
 * - GET    /api/v1/agencies/:agencyId/customers — tenant-scoped list/search.
 * - GET    /api/v1/agencies/:agencyId/customers/:customerId — detail with
 *   documents and the computed requirements state (07-A04).
 * - PATCH  /api/v1/agencies/:agencyId/customers/:customerId — update.
 * - POST   /api/v1/agencies/:agencyId/customers/:customerId/link — link the
 *   customer's platform account by verified email (07-A02).
 * - DELETE /api/v1/agencies/:agencyId/customers/:customerId/link — unlink.
 * - Documents: POST/GET list, PATCH metadata (resets to PENDING), POST
 *   verify (PENDING → VERIFIED/REJECTED).
 *
 * Authorization: `customer.read` for reads, `customer.manage` for record
 * writes, `customer.link` for account linkage, `customer.document.verify`
 * for verification. Tenant scope comes from the verified membership
 * (AgencyScopeGuard) — never from the URL.
 */
@Controller('agencies/:agencyId/customers')
export class CustomersController {
  constructor(private readonly service: CustomersService) {}

  @Post()
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_MANAGE)
  async create(@Param('agencyId') agencyId: string, @Body() body: CustomerInput): Promise<CustomerResponse> {
    return this.service.createCustomer(agencyId, body ?? {});
  }

  @Get()
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_READ)
  async list(
    @Param('agencyId') agencyId: string,
    @Query() query: CustomerListQuery,
  ): Promise<CustomerListResponse> {
    return this.service.listCustomers(agencyId, query ?? {});
  }

  @Get(':customerId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_READ)
  async get(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
  ): Promise<CustomerDetailResponse> {
    return this.service.getCustomerDetail(agencyId, customerId);
  }

  @Patch(':customerId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_MANAGE)
  async update(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
    @Body() body: CustomerInput,
  ): Promise<CustomerResponse> {
    return this.service.updateCustomer(agencyId, customerId, body ?? {});
  }

  @Post(':customerId/link')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_LINK)
  async link(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
    @Body() body: LinkCustomerInput,
  ): Promise<CustomerResponse> {
    return this.service.linkCustomer(agencyId, customerId, body ?? {});
  }

  @Delete(':customerId/link')
  @HttpCode(200)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_LINK)
  async unlink(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
  ): Promise<CustomerResponse> {
    return this.service.unlinkCustomer(agencyId, customerId);
  }

  @Post(':customerId/documents')
  @HttpCode(201)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_MANAGE)
  async createDocument(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
    @Body() body: DocumentInput,
  ): Promise<DocumentResponse> {
    return this.service.createDocument(agencyId, customerId, body ?? {});
  }

  @Get(':customerId/documents')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_READ)
  async listDocuments(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
  ): Promise<DocumentResponse[]> {
    return this.service.listDocuments(agencyId, customerId);
  }

  @Patch(':customerId/documents/:documentId')
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_MANAGE)
  async updateDocument(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @Body() body: DocumentInput,
  ): Promise<DocumentResponse> {
    return this.service.updateDocument(agencyId, customerId, documentId, body ?? {});
  }

  @Post(':customerId/documents/:documentId/verify')
  @HttpCode(200)
  @UseGuards(AgencyScopeGuard, PermissionGuard)
  @RequirePermission(Permission.CUSTOMER_DOCUMENT_VERIFY)
  async verifyDocument(
    @Param('agencyId') agencyId: string,
    @Param('customerId') customerId: string,
    @Param('documentId') documentId: string,
    @AuthUserId() actorUserId: string,
    @Body() body: VerifyDocumentInput,
  ): Promise<DocumentResponse> {
    return this.service.verifyDocument(agencyId, customerId, documentId, actorUserId, body ?? {});
  }
}
