export interface ProviderUploadResult {
  uploadUrl: string;
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
}
