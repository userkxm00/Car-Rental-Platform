import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { ObjectStorage, UploadedObject } from '../ports/object-storage.port';

/**
 * Test-only object storage double.
 *
 * Used by integration suites to exercise the full media flow (upload →
 * row → signed access → delete) without external credentials. Production
 * always wires {@link R2ObjectStorage}; this class ships only for tests and
 * is never registered in the application module.
 */
@Injectable()
export class LocalTempObjectStorage extends ObjectStorage {
  readonly objects = new Map<string, Buffer>();
  readonly signed = new Map<string, string>();

  override upload(input: {
    tenantId: string;
    vehicleId: string;
    kind: 'image' | 'document';
    data: Buffer;
    contentType: string;
  }): Promise<UploadedObject> {
    const objectKey = `private/${input.tenantId}/${input.vehicleId}/${input.kind}/${randomUUID()}`;
    this.objects.set(objectKey, input.data);
    this.signed.set(objectKey, `https://local.test/objects/${objectKey}`);
    return Promise.resolve({ objectKey });
  }

  override uploadDocument(input: {
    tenantId: string;
    kind: 'contract' | 'receipt';
    data: Buffer;
    contentType: string;
  }): Promise<UploadedObject> {
    const objectKey = `private/${input.tenantId}/${input.kind}s/${randomUUID()}.pdf`;
    this.objects.set(objectKey, input.data);
    this.signed.set(objectKey, `https://local.test/objects/${objectKey}`);
    return Promise.resolve({ objectKey });
  }

  override createSignedDownloadUrl(objectKey: string, _expiresInSeconds: number): Promise<string> {
    const url = this.signed.get(objectKey);
    if (!url) {
      return Promise.reject(new Error('object not found'));
    }
    return Promise.resolve(url);
  }

  override delete(objectKey: string): Promise<void> {
    this.objects.delete(objectKey);
    this.signed.delete(objectKey);
    return Promise.resolve();
  }
}
