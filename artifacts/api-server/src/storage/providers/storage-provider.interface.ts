export interface ProviderUploadResult {
  uploadUrl: string;
  storageKey: string;
  mediaUrl: string;
}

export interface MultipartInitResult {
  uploadId: string;
  storageKey: string;
  isVirtual: boolean;
}

export interface PartUrlResult {
  uploadUrl: string;
}

export interface CompletedPart {
  partNumber: number;
  etag: string;
}

export interface MultipartCompleteResult {
  storageKey: string;
  mediaUrl: string;
}

export interface StorageProvider {
  readonly providerType: string;
  readonly bucket: string;

  generateUploadUrl(params: {
    keyPrefix: string;
    submissionId?: string;
    index?: number;
    ext?: string;
    contentType?: string;
  }): Promise<ProviderUploadResult>;

  generateReadUrl(storageKey: string): Promise<string>;

  deleteObject(storageKey: string): Promise<void>;

  testConnection(): Promise<void>;

  initiateMultipartUpload(params: {
    keyPrefix: string;
    submissionId?: string;
    fileName?: string;
    contentType?: string;
  }): Promise<MultipartInitResult>;

  generatePartUploadUrl(params: {
    storageKey: string;
    uploadId: string;
    partNumber: number;
  }): Promise<PartUrlResult>;

  completeMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
    parts: CompletedPart[];
  }): Promise<MultipartCompleteResult>;

  abortMultipartUpload(params: {
    storageKey: string;
    uploadId: string;
  }): Promise<void>;
}
