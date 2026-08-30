/**
 * Object storage port (03-C01/03-C02).
 *
 * The single boundary between the platform and private object storage
 * (Cloudflare R2 per docs/provider-and-environment-contract.md). Private
 * objects by default (03-C03): nothing is ever publicly readable — access
 * flows exclusively through short-lived signed URLs minted server-side
 * (03-C08).
 */
export interface UploadedObject {
  objectKey: string;
}

export abstract class ObjectStorage {
  /** Store an object under a generated key; returns the key. */
  abstract upload(input: {
    tenantId: string;
    vehicleId: string;
    kind: 'image' | 'document';
    data: Buffer;
    contentType: string;
  }): Promise<UploadedObject>;

  /** Short-lived signed download URL (03-C08). */
  abstract createSignedDownloadUrl(objectKey: string, expiresInSeconds: number): Promise<string>;

  /** Remove an object. */
  abstract delete(objectKey: string): Promise<void>;
}
