import { Inject, Injectable } from '@nestjs/common';
import {
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { randomUUID } from 'node:crypto';
import { APP_ENV } from '../../config/app-env.token';
import type { AppEnv } from '@kavriqo/config';
import { ObjectStorage, UploadedObject } from '../ports/object-storage.port';

const UPLOAD_PREFIX = 'private';

/**
 * Cloudflare R2 adapter (03-C02).
 *
 * Real S3-compatible client against the R2 endpoint from the environment
 * contract (R2_ACCOUNT_ID/R2_BUCKET/R2_ENDPOINT/R2_ACCESS_KEY_ID/
 * R2_SECRET_ACCESS_KEY). Keys are server-generated under a private prefix;
 * downloads are only ever exposed as presigned URLs (03-C03/03-C08).
 */
@Injectable()
export class R2ObjectStorage extends ObjectStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor(@Inject(APP_ENV) env: AppEnv) {
    super();
    this.bucket = env.R2_BUCKET;
    this.client = new S3Client({
      region: 'auto',
      endpoint: env.R2_ENDPOINT ?? `https://${env.R2_ACCOUNT_ID ?? ''}.r2.cloudflarestorage.com`,
      credentials: {
        accessKeyId: env.R2_ACCESS_KEY_ID ?? '',
        secretAccessKey: env.R2_SECRET_ACCESS_KEY ?? '',
      },
    });
  }

  override async upload(input: {
    tenantId: string;
    vehicleId: string;
    kind: 'image' | 'document';
    data: Buffer;
    contentType: string;
  }): Promise<UploadedObject> {
    const objectKey = `${UPLOAD_PREFIX}/${input.tenantId}/${input.vehicleId}/${input.kind}/${randomUUID()}`;
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket,
        Key: objectKey,
        Body: input.data,
        ContentType: input.contentType,
      }),
    );
    return { objectKey };
  }

  override async createSignedDownloadUrl(
    objectKey: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: objectKey }),
      { expiresIn: expiresInSeconds },
    );
  }

  override async delete(objectKey: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: objectKey }));
  }
}
