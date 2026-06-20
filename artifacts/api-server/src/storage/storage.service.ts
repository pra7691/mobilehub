import { Injectable } from '@nestjs/common';
import { generateUploadUrl, generateReadUrl } from '../lib/objectStorage';

interface GetUploadUrlParams {
  submissionId?: string;
  index?: number;
  ext?: string;
  contentType?: string;
}

@Injectable()
export class StorageService {
  async getUploadUrl(params: GetUploadUrlParams = {}): Promise<{
    uploadURL: string;
    objectPath: string;
    objectKey: string;
  }> {
    return generateUploadUrl(params);
  }

  async getReadUrl(objectKey: string): Promise<string> {
    return generateReadUrl(objectKey);
  }
}
