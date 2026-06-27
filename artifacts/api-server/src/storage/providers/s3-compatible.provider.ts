import { randomUUID } from 'crypto';
import {
  S3Client,
  HeadBucketCommand,
  DeleteObjectCommand,
  CreateMultipartUploadCommand,
  UploadPartCommand,
  CompleteMultipartUploadCommand,
  AbortMultipartUploadCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type {
  StorageProvider,
  ProviderUploadResult,
  MultipartInitResult,
  PartUrlResult,
  CompletedPart,
  MultipartCompleteResult,
} from './storage-provider.interface';

export interface S3CompatibleCredentials {
  accessKeyId: string;
  secretAccessKey: string;
}

export class S3CompatibleStorageProvider implements StorageProvider {
  readonly providerType: string;
  readonly bucket: string;

  private readonly client: S3Client;

  constructor(params: {
    providerType: string;
    bucket: string;
    region?: string;
    endpoint?: string;
    credentials: S3CompatibleCredentials;
  }) {
    this.providerType = params.providerType;
    this.bucket = params.bucket;

    const clientConfig: ConstructorParameters<typeof S3Client>[0] = {
      region: params.region ?? 'auto',
      credentials: {
        accessKeyId: params.credentials.accessKeyId,
        secretAccessKey: params.credentials.secretAccessKey,
      },
    };

    if (params.endpoint) {
      clientConfig.endpoint = params.endpoint;
      // Needed for Cloudflare R2 and DigitalOcean Spaces path-style access
      clientConfig.forcePathStyle = params.providerType === 'CLOUDFLARE_R2';
    }

    this.client = new S3Client(clientConfig);
  }

  async generateUploadUrl(params: {
    keyPrefix: string;
    submissionId?: string;
    index?: number;
    ext?: string;
    contentType?: string;
  }): Promise<ProviderUploadResult> {
    const suffix = params.ext ? `.${params.ext}` : '';
    const uuid = randomUUID();
    const prefix = params.keyPrefix || 'tarzi';
    const subDir = params.submissionId
      ? `${prefix}/submissions/${params.submissionId}`
      : `${prefix}/uploads`;
    const objectKey =
      params.index != null
        ? `${subDir}/${params.index}_${uuid}${suffix}`
        : `${subDir}/${uuid}${suffix}`;

    const cmd = new PutObjectCommand({
      Bucket: this.bucket,
      Key: objectKey,
      ContentType: params.contentType ?? 'application/octet-stream',
    });

    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 900 });

    return {
      uploadUrl,
      storageKey: objectKey,
      mediaUrl: objectKey,
    };
  }

  async generateReadUrl(storageKey: string): Promise<string> {
    const cmd = new GetObjectCommand({
      Bucket: this.bucket,
      Key: storageKey,
    });
    return getSignedUrl(this.client, cmd, { expiresIn: 3600 });
  }

  async deleteObject(storageKey: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: storageKey }),
    );
  }

  async testConnection(): Promise<void> {
    await this.client.send(new HeadBucketCommand({ Bucket: this.bucket }));
  }

  async initiateMultipartUpload(params: {
    keyPrefix: string;
    submissionId?: string;
    fileName?: string;
    contentType?: string;
  }): Promise<MultipartInitResult> {
    const ext = params.fileName?.split('.').pop() ?? 'bin';
    const uuid = randomUUID();
    const prefix = params.keyPrefix || 'tarzi';
    const subDir = params.submissionId
      ? `${prefix}/submissions/${params.submissionId}`
      : `${prefix}/uploads`;
    const storageKey = `${subDir}/${uuid}.${ext}`;

    const cmd = new CreateMultipartUploadCommand({
      Bucket: this.bucket,
      Key: storageKey,
      ContentType: params.contentType ?? 'application/octet-stream',
    });
    const result = await this.client.send(cmd);

    return {
      uploadId: result.UploadId!,
      storageKey,
      isVirtual: false,
    };
  }

  async generatePartUploadUrl(params: {
    storageKey: string;
    uploadId: string;
    partNumber: number;
  }): Promise<PartUrlResult> {
    const cmd = new UploadPartCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      UploadId: params.uploadId,
      PartNumber: params.partNumber,
    });
    const uploadUrl = await getSignedUrl(this.client, cmd, { expiresIn: 900 });
    return { uploadUrl };
  }

  async completeMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
    parts: CompletedPart[];
  }): Promise<MultipartCompleteResult> {
    const cmd = new CompleteMultipartUploadCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      UploadId: params.uploadId,
      MultipartUpload: {
        Parts: [...params.parts]
          .sort((a, b) => a.partNumber - b.partNumber)
          .map((p) => ({ PartNumber: p.partNumber, ETag: p.etag })),
      },
    });
    await this.client.send(cmd);
    return {
      storageKey: params.storageKey,
      mediaUrl: params.storageKey,
    };
  }

  async abortMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
  }): Promise<void> {
    const cmd = new AbortMultipartUploadCommand({
      Bucket: this.bucket,
      Key: params.storageKey,
      UploadId: params.uploadId,
    });
    await this.client.send(cmd);
  }
}
