import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { loadEnvSchema } from '@kavriqo/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/app.setup';
import { APP_ENV } from '../src/config/app-env.token';
import { MediaService } from '../src/media/application/media.service';
import { LocalTempObjectStorage } from '../src/media/infrastructure/local-temp-object-storage';
import { ObjectStorage } from '../src/media/ports/object-storage.port';
import { MembershipService } from '../src/memberships/application/membership.service';
import { TenantService } from '../src/tenants/application/tenant.service';
import { CategoriesService } from '../src/fleet/application/categories.service';
import { VehiclesService } from '../src/fleet/application/vehicles.service';
import type { ApiErrorBody } from '../src/common/errors/api-error.contract';
import { api } from './http';
import { JwksTestServer, startJwksTestServer } from './helpers/jwks-test-server';

/**
 * Vehicle media/document integration tests (03-C): private-object policy,
 * gallery ordering/primary image, upload validation, signed access,
 * document expiry — over real HTTP with a real database. Object storage is
 * a local test double (production wires Cloudflare R2); the storage port
 * and metadata flows are exercised end-to-end.
 */

const LOCAL_TEST_DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgresql://postgres:postgres@127.0.0.1:5432/car_rental';
const JWKS_PORT = 4133;

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 4]);

describe('Vehicle media (integration)', () => {
  let jwks: JwksTestServer;
  let app: INestApplication;
  let prisma: PrismaClient;
  let storage: LocalTempObjectStorage;
  let tenants: TenantService;
  let memberships: MembershipService;
  let categories: CategoriesService;
  let vehicles: VehiclesService;
  let media: MediaService;

  let agencyId: string;
  let vehicleId: string;

  beforeAll(async () => {
    jwks = await startJwksTestServer(JWKS_PORT);
    const testEnv = loadEnvSchema({
      DATABASE_URL: LOCAL_TEST_DATABASE_URL,
      SUPABASE_JWT_ISSUER: jwks.issuer,
      SUPABASE_JWKS_URL: jwks.jwksUrl,
    });
    storage = new LocalTempObjectStorage();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_ENV)
      .useValue(testEnv)
      .overrideProvider(ObjectStorage)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();

    tenants = app.get(TenantService);
    memberships = app.get(MembershipService);
    categories = app.get(CategoriesService);
    vehicles = app.get(VehiclesService);
    media = app.get(MediaService);

    const pool = new Pool({ connectionString: LOCAL_TEST_DATABASE_URL });
    prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

    agencyId = (await tenants.create({ name: 'MED Agency', slug: 'med-agency' })).id;
    const category = await categories.create(agencyId, { name: 'Sedan', code: 'SED' });
    const vehicle = await vehicles.create(agencyId, {
      categoryId: category.id,
      make: 'Hyundai',
      model: 'Accent',
      year: 2023,
      plateNumber: '12345-31',
    });
    vehicleId = vehicle.id;

    const owner = await appUserId('med-owner');
    const membership = await memberships.invite(agencyId, owner, ['AGENCY_OWNER_ADMIN']);
    await memberships.accept(owner, membership.id);
  });

  afterAll(async () => {
    await prisma.tenant.deleteMany({ where: { slug: { startsWith: 'med-' } } });
    await prisma.$disconnect();
    await app.close();
    await jwks.close();
  });

  async function token(subject: string): Promise<string> {
    return jwks.signToken({ sub: subject, email: `${subject}@kavriqo.test`, email_verified: true });
  }

  async function appUserId(subject: string): Promise<string> {
    const res = await api(app)
      .get('/api/v1/me')
      .set('Authorization', `Bearer ${await token(subject)}`)
      .expect(200);
    return (res.body as { id: string }).id;
  }

  const ownerAuth = (): Promise<string> => token('med-owner');

  it('uploads images via the service with validation (03-C09)', async () => {
    const image = await media.uploadImage(agencyId, vehicleId, {
      data: PNG_BYTES,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    expect(image).toMatchObject({ contentType: 'image/png', isPrimary: true, position: 0 });
    expect(image.checksumSha256).toMatch(/^[0-9a-f]{64}$/);

    await expect(
      media.uploadImage(agencyId, vehicleId, {
        data: Buffer.from('not an image'),
        contentType: 'text/html',
        sizeBytes: 11,
      }),
    ).rejects.toMatchObject({ response: { code: 'UPLOAD_VALIDATION_FAILED' } });
  });

  it('maintains exactly one primary image and orders the gallery (03-C05)', async () => {
    const extra = await media.uploadImage(agencyId, vehicleId, {
      data: PNG_BYTES,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    const before = await media.listImages(agencyId, vehicleId);
    expect(before.filter((i) => i.isPrimary)).toHaveLength(1);

    // Switch primary to the newly uploaded image: still exactly one.
    const images = await media.setPrimaryImage(agencyId, vehicleId, extra.id);
    expect(images.filter((i) => i.isPrimary)).toHaveLength(1);
    expect(images.find((i) => i.id === extra.id)?.isPrimary).toBe(true);

    // Reorder: every image exactly once, in the given order.
    const reversed = [...images].reverse().map((i) => i.id);
    const reordered = await media.reorderImages(agencyId, vehicleId, reversed);
    expect(reordered.map((i) => i.id)).toEqual(reversed);

    await expect(media.reorderImages(agencyId, vehicleId, [extra.id])).rejects.toMatchObject({
      response: { code: 'UPLOAD_VALIDATION_FAILED' },
    });
  });

  it('exposes gallery content only through signed URLs (03-C03/08)', async () => {
    const images = await media.listImages(agencyId, vehicleId);
    const first = images[0];
    if (!first) throw new Error('no images');

    const signed = await media.signedImageUrl(agencyId, vehicleId, first.id);
    expect(signed.url).toContain('/objects/');
    expect(signed.expiresAt.getTime()).toBeGreaterThan(Date.now());

    // Metadata responses never contain raw object URLs.
    const listRes = await api(app)
      .get(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/images`)
      .set('Authorization', `Bearer ${await ownerAuth()}`)
      .expect(200);
    const body = listRes.body as { images: Array<Record<string, unknown>> };
    expect(JSON.stringify(body)).not.toContain('objectKey');
    expect(JSON.stringify(body)).not.toContain('/objects/');
  });

  it('uploads documents with expiry rules (03-C06/07)', async () => {
    const document = await media.uploadDocument(
      agencyId,
      vehicleId,
      { data: Buffer.from('%PDF-1.4 fake'), contentType: 'application/pdf', sizeBytes: 14 },
      {
        type: 'INSURANCE',
        title: 'Insurance 2026',
        issuedAt: '2026-01-01',
        expiresAt: '2026-12-31',
      },
    );
    expect(document).toMatchObject({ type: 'INSURANCE', title: 'Insurance 2026' });

    await expect(
      media.uploadDocument(
        agencyId,
        vehicleId,
        { data: Buffer.from('x'), contentType: 'application/pdf', sizeBytes: 1 },
        { type: 'INSURANCE', title: 'Bad dates', issuedAt: '2027-01-01', expiresAt: '2026-01-01' },
      ),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_VALIDATION_FAILED' } });

    await expect(
      media.uploadDocument(
        agencyId,
        vehicleId,
        { data: Buffer.from('x'), contentType: 'text/plain', sizeBytes: 1 },
        { type: 'INSURANCE', title: 'Bad type' },
      ),
    ).rejects.toMatchObject({ response: { code: 'DOCUMENT_VALIDATION_FAILED' } });
  });

  it('computes document expiry and issues signed document URLs', async () => {
    const expired = await media.uploadDocument(
      agencyId,
      vehicleId,
      { data: Buffer.from('%PDF-1.4 old'), contentType: 'application/pdf', sizeBytes: 13 },
      { type: 'INSPECTION_CERTIFICATE', title: 'Old inspection', expiresAt: '2020-01-01' },
    );
    const documents = await media.listDocuments(agencyId, vehicleId);
    const expiredRow = documents.find((d) => d.id === expired.id);
    expect(expiredRow?.expired).toBe(true);

    const signed = await media.signedDocumentUrl(agencyId, vehicleId, expired.id);
    expect(signed.url).toContain('/objects/');
  });

  it('deletes images and documents along with their stored objects', async () => {
    const image = await media.uploadImage(agencyId, vehicleId, {
      data: PNG_BYTES,
      contentType: 'image/png',
      sizeBytes: PNG_BYTES.length,
    });
    const before = storage.objects.size;
    await media.deleteImage(agencyId, vehicleId, image.id);
    expect(storage.objects.size).toBe(before - 1);
  });

  it('denies media access to other agencies (tenant isolation)', async () => {
    const foreign = await tenants.create({ name: 'MED Foreign', slug: 'med-foreign' });
    const foreignUser = await appUserId('med-foreign-user');
    await memberships.invite(foreign.id, foreignUser, ['AGENCY_OWNER_ADMIN']);
    const membership = (await memberships.listForTenant(foreign.id)).find(
      (m) => m.userId === foreignUser,
    );
    if (membership) {
      await memberships.accept(foreignUser, membership.id);
    }
    const res = await api(app)
      .get(`/api/v1/agencies/${foreign.id}/vehicles/${vehicleId}/images`)
      .set('Authorization', `Bearer ${await token('med-foreign-user')}`)
      .expect(404);
    expect(res.body).toBeTruthy();
  });

  it('rejects unsupported uploads over HTTP (03-C09)', async () => {
    const res = await api(app)
      .post(`/api/v1/agencies/${agencyId}/vehicles/${vehicleId}/documents`)
      .set('Authorization', `Bearer ${await ownerAuth()}`)
      .field('type', 'INSURANCE')
      .field('title', 'X')
      .attach('file', Buffer.from('plain text'), { filename: 'x.txt', contentType: 'text/plain' })
      .expect(409);
    const body = res.body as ApiErrorBody;
    expect(body.error.code).toBe('DOCUMENT_VALIDATION_FAILED');
  });
});
