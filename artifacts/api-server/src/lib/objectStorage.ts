import { Storage } from "@google-cloud/storage";
import { randomUUID } from "crypto";

const REPLIT_SIDECAR_ENDPOINT = "http://127.0.0.1:1106";

export const objectStorageClient = new Storage({
  credentials: {
    audience: "replit",
    subject_token_type: "access_token",
    token_url: `${REPLIT_SIDECAR_ENDPOINT}/token`,
    type: "external_account",
    credential_source: {
      url: `${REPLIT_SIDECAR_ENDPOINT}/credential`,
      format: {
        type: "json",
        subject_token_field_name: "access_token",
      },
    },
    universe_domain: "googleapis.com",
  },
  projectId: "",
} as ConstructorParameters<typeof Storage>[0]);

function getPrivateObjectDir(): string {
  const dir = process.env.PRIVATE_OBJECT_DIR || "";
  if (!dir) {
    throw new Error("PRIVATE_OBJECT_DIR not set. Create a bucket in Object Storage tool.");
  }
  return dir;
}

function parseObjectPath(path: string): { bucketName: string; objectName: string } {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const parts = path.split("/");
  if (parts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }
  return { bucketName: parts[1]!, objectName: parts.slice(2).join("/") };
}

async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const response = await fetch(
    `${REPLIT_SIDECAR_ENDPOINT}/object-storage/signed-object-url`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        bucket_name: bucketName,
        object_name: objectName,
        method,
        expires_at: new Date(Date.now() + ttlSec * 1000).toISOString(),
      }),
      signal: AbortSignal.timeout(30_000),
    }
  );
  if (!response.ok) {
    throw new Error(`Failed to sign object URL, status: ${response.status}`);
  }
  const { signed_url: signedURL } = await response.json() as { signed_url: string };
  return signedURL;
}

export interface UploadUrlResult {
  uploadURL: string;
  objectPath: string;
  objectKey: string;
}

export async function generateUploadUrl(params: {
  submissionId?: string;
  index?: number;
  ext?: string;
  contentType?: string;
} = {}): Promise<UploadUrlResult> {
  const privateObjectDir = getPrivateObjectDir();
  const suffix = params.ext ? `.${params.ext}` : "";
  const objectId = randomUUID();
  const subDir = params.submissionId
    ? `submissions/${params.submissionId}`
    : "uploads";
  const objectName = params.index != null
    ? `${subDir}/${params.index}_${objectId}${suffix}`
    : `${subDir}/${objectId}${suffix}`;

  const fullPath = `${privateObjectDir}/${objectName}`;
  const { bucketName, objectName: bucketObjectName } = parseObjectPath(fullPath);
  const uploadURL = await signObjectURL({
    bucketName,
    objectName: bucketObjectName,
    method: "PUT",
    ttlSec: 900,
  });

  // objectKey is used to later generate a signed read URL; objectPath is what we store
  const objectKey = fullPath;
  const objectPath = `/objects/${objectName}`;
  return { uploadURL, objectPath, objectKey };
}

export async function generateReadUrl(objectKey: string): Promise<string> {
  const { bucketName, objectName } = parseObjectPath(objectKey);
  return signObjectURL({ bucketName, objectName, method: "GET", ttlSec: 3600 });
}
