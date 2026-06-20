import { Injectable } from '@nestjs/common';
import { generateUploadUrl, type UploadUrlResult } from '../lib/objectStorage';

@Injectable()
export class StorageService {
  async getUploadUrl(): Promise<UploadUrlResult> {
    return generateUploadUrl();
  }
}
