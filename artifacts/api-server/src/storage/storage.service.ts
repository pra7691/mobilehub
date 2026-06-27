import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { StorageProfileService } from './storage-profile.service';
import { ReplitStorageProvider } from './providers/replit.provider';
import type { StorageProvider, ProviderUploadResult } from './providers/storage-provider.interface';

export interface ActiveProviderResult {
  provider: StorageProvider;
  profileId: string | null;
  providerType: string;
  bucket: string;
  keyPrefix: string;
}

export interface UploadUrlResult extends ProviderUploadResult {
  storageProfileId: string | null;
  storageProvider: string;
  bucket: string;
}

@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly fallbackProvider = new ReplitStorageProvider();

  constructor(private readonly profiles: StorageProfileService) {}

  async onModuleInit() {
    const active = await this.profiles.getActiveProfile();
    if (!active) {
      this.logger.warn(
        'No active storage profile found. Upload URLs will use the legacy Replit provider. ' +
        'Create and activate a storage profile in Admin Settings → Storage.',
      );
    }
  }

  /**
   * Generates a signed upload URL for a new media file.
   * Uses the currently active storage profile; falls back to Replit GCS sidecar.
   */
  async getUploadUrl(params: {
    submissionId?: string;
    index?: number;
    ext?: string;
    contentType?: string;
  } = {}): Promise<UploadUrlResult> {
    const active = await this.profiles.getActiveProfile();

    if (!active) {
      const result = await this.fallbackProvider.generateUploadUrl({
        keyPrefix: 'tarzi',
        ...params,
      });
      return {
        ...result,
        storageProfileId: null,
        storageProvider: 'REPLIT',
        bucket: this.fallbackProvider.bucket,
      };
    }

    const provider = this.profiles.buildProvider(active);
    const result = await provider.generateUploadUrl({
      keyPrefix: active.keyPrefix,
      ...params,
    });

    return {
      ...result,
      storageProfileId: active.id,
      storageProvider: active.providerType,
      bucket: provider.bucket,
    };
  }

  /**
   * Generates a signed read URL for an existing media file.
   *
   * If storageProfileId is provided, routes to that profile's provider.
   * If null/undefined (legacy records), falls back to the Replit GCS provider.
   */
  async getReadUrl(
    storageKey: string,
    storageProfileId?: string | null,
  ): Promise<string> {
    if (!storageProfileId) {
      return this.fallbackProvider.generateReadUrl(storageKey);
    }

    const profile = await this.profiles.getProfileById(storageProfileId);
    if (!profile) {
      this.logger.warn(`Storage profile ${storageProfileId} not found; falling back to Replit`);
      return this.fallbackProvider.generateReadUrl(storageKey);
    }

    const provider = this.profiles.buildProvider(profile);
    return provider.generateReadUrl(storageKey);
  }

  /**
   * Returns the currently active provider (or Replit fallback) with full metadata.
   * Used by UploadSessionService to initiate multipart uploads.
   */
  async getActiveProvider(): Promise<ActiveProviderResult> {
    const active = await this.profiles.getActiveProfile();
    if (!active) {
      return {
        provider: this.fallbackProvider,
        profileId: null,
        providerType: 'REPLIT',
        bucket: this.fallbackProvider.bucket,
        keyPrefix: 'tarzi',
      };
    }
    const provider = this.profiles.buildProvider(active);
    return {
      provider,
      profileId: active.id,
      providerType: active.providerType,
      bucket: provider.bucket,
      keyPrefix: active.keyPrefix,
    };
  }

  /**
   * Returns a provider for a known profileId (or Replit fallback if null/not found).
   * Used by UploadSessionService when completing/aborting a session.
   */
  async getProviderForProfileId(profileId: string | null): Promise<StorageProvider> {
    if (!profileId) {
      return this.fallbackProvider;
    }
    const profile = await this.profiles.getProfileById(profileId);
    if (!profile) {
      this.logger.warn(`Storage profile ${profileId} not found; using Replit fallback`);
      return this.fallbackProvider;
    }
    return this.profiles.buildProvider(profile);
  }

  /**
   * Deletes an object from its original storage provider.
   */
  async deleteObject(
    storageKey: string,
    storageProfileId?: string | null,
  ): Promise<void> {
    if (!storageProfileId) {
      await this.fallbackProvider.deleteObject(storageKey);
      return;
    }

    const profile = await this.profiles.getProfileById(storageProfileId);
    if (!profile) {
      this.logger.warn(`Storage profile ${storageProfileId} not found; skipping delete`);
      return;
    }

    const provider = this.profiles.buildProvider(profile);
    await provider.deleteObject(storageKey);
  }
}
