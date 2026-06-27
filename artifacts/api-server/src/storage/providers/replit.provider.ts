import { randomUUID } from 'crypto';
import type {
  StorageProvider,
  ProviderUploadResult,
  MultipartInitResult,
  PartUrlResult,
  CompletedPart,
  MultipartCompleteResult,
} from './storage-provider.interface';

const SIDECAR = 'http://127.0.0.1:1106';

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR ?? '';
  if (!dir) throw new Error('PRIVATE_OBJECT_DIR not set');
  return dir;
}

function parsePath(path: string): { bucketName: string; objectName: string } {
  const p = path.startsWith('/') ? path : `/${path}`;
  const parts = p.split('/');
  if (parts.length < 3) throw new Error(`Invalid GCS path: ${path}`);
  return { bucketName: parts[1]!, objectName: parts.slice(2).join('/') };
}

async function signUrl({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: 'GET' | 'PUT' | 'DELETE' | 'HEAD';
  ttlSec: number;
}): Promise<string> {
  const res = await fetch(`${SIDECAR}/object-storage/signed-object-url`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
      expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!res.ok) throw new Error(`Sidecar sign failed: ${res.status}`);
  const { signed_url } = await res.json() as { signed_url: string };
  return signed_url;
}

export class ReplitStorageProvider implements StorageProvider {
  readonly providerType = 'REPLIT';
  get bucket(): string {
    try {
      return parsePath(getPrivateObjectDir()).bucketName;
    } catch {
      return 'replit-default';
    }
  }

  async generateUploadUrl(params: {
    keyPrefix: string;
    submissionId?: string;
    index?: number;
    ext?: string;
    contentType?: string;
  }): Promise<ProviderUploadResult> {
    const dir = getPrivateObjectDir();
    const suffix = params.ext ? `.${params.ext}` : '';
    const uuid = randomUUID();
    const subDir = params.submissionId
      ? `submissions/${params.submissionId}`
      : 'uploads';
    const objectName =
      params.index != null
        ? `${subDir}/${params.index}_${uuid}${suffix}`
        : `${subDir}/${uuid}${suffix}`;

    const fullPath = `${dir}/${objectName}`;
    const { bucketName, objectName: bucketObjectName } = parsePath(fullPath);

    const uploadUrl = await signUrl({
      bucketName,
      objectName: bucketObjectName,
      method: 'PUT',
      ttlSec: 900,
    });

    return {
      uploadUrl,
      storageKey: fullPath,
      mediaUrl: `/objects/${objectName}`,
    };
  }

  async generateReadUrl(storageKey: string): Promise<string> {
    const { bucketName, objectName } = parsePath(storageKey);
    return signUrl({ bucketName, objectName, method: 'GET', ttlSec: 3600 });
  }

  async deleteObject(storageKey: string): Promise<void> {
    const { bucketName, objectName } = parsePath(storageKey);
    await signUrl({ bucketName, objectName, method: 'DELETE', ttlSec: 60 });
  }

  async testConnection(): Promise<void> {
    const dir = getPrivateObjectDir();
    const { bucketName } = parsePath(dir);
    await signUrl({
      bucketName,
      objectName: `.tarzi-test-${Date.now()}`,
      method: 'PUT',
      ttlSec: 30,
    });
  }

  async initiateMultipartUpload(params: {
    keyPrefix: string;
    submissionId?: string;
    fileName?: string;
    contentType?: string;
  }): Promise<MultipartInitResult> {
    const dir = getPrivateObjectDir();
    const ext = params.fileName?.split('.').pop() ?? 'bin';
    const uuid = randomUUID();
    const subDir = params.submissionId
      ? `submissions/${params.submissionId}`
      : 'uploads';
    const objectName = `${subDir}/${uuid}.${ext}`;
    const fullPath = `${dir}/${objectName}`;

    return {
      uploadId: randomUUID(),
      storageKey: fullPath,
      isVirtual: true,
    };
  }

  async generatePartUploadUrl(params: {
    storageKey: string;
    uploadId: string;
    partNumber: number;
  }): Promise<PartUrlResult> {
    if (params.partNumber !== 1) {
      throw new Error(
        'Replit storage only supports single-part uploads (partNumber must be 1)',
      );
    }
    const { bucketName, objectName } = parsePath(params.storageKey);
    const uploadUrl = await signUrl({
      bucketName,
      objectName,
      method: 'PUT',
      ttlSec: 900,
    });
    return { uploadUrl };
  }

  async completeMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
    parts: CompletedPart[];
  }): Promise<MultipartCompleteResult> {
    void params;
    const { objectName } = parsePath(params.storageKey);
    return {
      storageKey: params.storageKey,
      mediaUrl: `/objects/${objectName}`,
    };
  }

  async abortMultipartUpload(_params: {
    storageKey: string;
    uploadId: string;
  }): Promise<void> {
    // Virtual session — nothing to abort on the Replit sidecar
  }
}
