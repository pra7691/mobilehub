import { Injectable } from '@nestjs/common';
import { generateUploadUrl } from '../lib/objectStorage';

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
}
