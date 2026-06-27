import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { EncryptionService } from './encryption.service';
import { ReplitStorageProvider } from './providers/replit.provider';
import {
  S3CompatibleStorageProvider,
  type S3CompatibleCredentials,
} from './providers/s3-compatible.provider';
import type { StorageProvider } from './providers/storage-provider.interface';
import type { CreateStorageProfileDto, UpdateStorageProfileDto } from './storage-profile.dto';
import type { StorageProfile } from '@prisma/client';

const MASKED = '••••••••';

interface DecryptedCredentials {
  accessKeyId?: string;
  secretAccessKey?: string;
}

interface ProfileResponse {
  id: string;
  name: string;
  providerType: string;
  bucket: string | null;
  region: string | null;
  endpoint: string | null;
  publicBaseUrl: string | null;
  keyPrefix: string;
  isActive: boolean;
  hasCredentials: boolean;
  accessKeyIdMasked: string | null;
  lastTestedAt: Date | null;
  lastTestResult: string | null;
  mediaCount: number;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class StorageProfileService {
  private readonly logger = new Logger(StorageProfileService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly encryption: EncryptionService,
  ) {}

  private encryptCredentials(creds: DecryptedCredentials): string {
    return this.encryption.encrypt(JSON.stringify(creds));
  }

  private decryptCredentials(encrypted: string | null): DecryptedCredentials {
    if (!encrypted) return {};
    try {
      return JSON.parse(this.encryption.decrypt(encrypted)) as DecryptedCredentials;
    } catch {
      return {};
    }
  }

  private maskProfile(
    p: StorageProfile & { _count?: { media?: number } },
    mediaCount = 0,
  ): ProfileResponse {
    const creds = this.decryptCredentials(p.encryptedCredentials);
    return {
      id: p.id,
      name: p.name,
      providerType: p.providerType,
      bucket: p.bucket,
      region: p.region,
      endpoint: p.endpoint,
      publicBaseUrl: p.publicBaseUrl,
      keyPrefix: p.keyPrefix,
      isActive: p.isActive,
      hasCredentials: !!(creds.accessKeyId || creds.secretAccessKey),
      accessKeyIdMasked: creds.accessKeyId
        ? creds.accessKeyId.slice(0, 4) + MASKED
        : null,
      lastTestedAt: p.lastTestedAt,
      lastTestResult: p.lastTestResult,
      mediaCount: p._count?.media ?? mediaCount,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  buildProvider(profile: StorageProfile): StorageProvider {
    if (profile.providerType === 'REPLIT') {
      return new ReplitStorageProvider();
    }

    const creds = this.decryptCredentials(profile.encryptedCredentials);
    if (!creds.accessKeyId || !creds.secretAccessKey) {
      throw new BadRequestException(
        'Profile is missing credentials. Update the profile with accessKeyId and secretAccessKey.',
      );
    }
    if (!profile.bucket) {
      throw new BadRequestException('Profile is missing bucket name.');
    }

    const s3Creds: S3CompatibleCredentials = {
      accessKeyId: creds.accessKeyId,
      secretAccessKey: creds.secretAccessKey,
    };

    return new S3CompatibleStorageProvider({
      providerType: profile.providerType,
      bucket: profile.bucket,
      region: profile.region ?? undefined,
      endpoint: profile.endpoint ?? undefined,
      credentials: s3Creds,
    });
  }

  async findAll(): Promise<ProfileResponse[]> {
    const profiles = await this.prisma.storageProfile.findMany({
      orderBy: [{ isActive: 'desc' }, { createdAt: 'desc' }],
      include: { _count: { select: { media: true } } },
    });
    return profiles.map((p) => this.maskProfile(p));
  }

  async findOne(id: string): Promise<ProfileResponse> {
    const p = await this.prisma.storageProfile.findUnique({
      where: { id },
      include: { _count: { select: { media: true } } },
    });
    if (!p) throw new NotFoundException('Storage profile not found');
    return this.maskProfile(p);
  }

  async create(dto: CreateStorageProfileDto): Promise<ProfileResponse> {
    const creds: DecryptedCredentials = {};
    if (dto.accessKeyId) creds.accessKeyId = dto.accessKeyId;
    if (dto.secretAccessKey) creds.secretAccessKey = dto.secretAccessKey;

    const hasCredentials = !!(creds.accessKeyId || creds.secretAccessKey);

    const p = await this.prisma.storageProfile.create({
      data: {
        name: dto.name,
        providerType: dto.providerType as any,
        bucket: dto.bucket ?? null,
        region: dto.region ?? null,
        endpoint: dto.endpoint ?? null,
        publicBaseUrl: dto.publicBaseUrl ?? null,
        keyPrefix: dto.keyPrefix ?? 'tarzi',
        encryptedCredentials: hasCredentials
          ? this.encryptCredentials(creds)
          : null,
      },
    });
    return this.maskProfile(p);
  }

  async update(id: string, dto: UpdateStorageProfileDto): Promise<ProfileResponse> {
    const existing = await this.prisma.storageProfile.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Storage profile not found');

    const existingCreds = this.decryptCredentials(existing.encryptedCredentials);
    const updatedCreds: DecryptedCredentials = { ...existingCreds };

    if (dto.accessKeyId !== undefined) updatedCreds.accessKeyId = dto.accessKeyId || undefined;
    if (dto.secretAccessKey !== undefined) updatedCreds.secretAccessKey = dto.secretAccessKey || undefined;

    const hasCredentials = !!(updatedCreds.accessKeyId || updatedCreds.secretAccessKey);

    const p = await this.prisma.storageProfile.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name }),
        ...(dto.providerType !== undefined && { providerType: dto.providerType as any }),
        ...(dto.bucket !== undefined && { bucket: dto.bucket }),
        ...(dto.region !== undefined && { region: dto.region }),
        ...(dto.endpoint !== undefined && { endpoint: dto.endpoint }),
        ...(dto.publicBaseUrl !== undefined && { publicBaseUrl: dto.publicBaseUrl }),
        ...(dto.keyPrefix !== undefined && { keyPrefix: dto.keyPrefix }),
        encryptedCredentials: hasCredentials
          ? this.encryptCredentials(updatedCreds)
          : null,
        // Reset test result if provider-relevant fields changed
        ...(dto.providerType || dto.bucket || dto.endpoint || dto.accessKeyId || dto.secretAccessKey
          ? { lastTestedAt: null, lastTestResult: null }
          : {}),
      },
    });
    return this.maskProfile(p);
  }

  async remove(id: string): Promise<void> {
    const profile = await this.prisma.storageProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Storage profile not found');

    if (profile.isActive) {
      throw new BadRequestException(
        'Cannot delete the active storage profile. Activate another profile first.',
      );
    }

    const mediaCount = await this.prisma.submissionMedia.count({
      where: { storageProfileId: id },
    });
    if (mediaCount > 0) {
      throw new BadRequestException(
        `Cannot delete: ${mediaCount} media file(s) are linked to this profile.`,
      );
    }

    await this.prisma.storageProfile.delete({ where: { id } });
  }

  async testConnection(id: string): Promise<{ ok: boolean; message: string }> {
    const profile = await this.prisma.storageProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Storage profile not found');

    try {
      const provider = this.buildProvider(profile);
      await provider.testConnection();

      await this.prisma.storageProfile.update({
        where: { id },
        data: { lastTestedAt: new Date(), lastTestResult: 'ok' },
      });

      return { ok: true, message: 'Connection successful' };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection failed';
      await this.prisma.storageProfile.update({
        where: { id },
        data: { lastTestedAt: new Date(), lastTestResult: message.slice(0, 500) },
      });
      return { ok: false, message };
    }
  }

  async activate(id: string): Promise<ProfileResponse> {
    const profile = await this.prisma.storageProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Storage profile not found');

    if (profile.lastTestResult !== 'ok') {
      throw new BadRequestException(
        'Profile must pass a connection test before activation. Run "Test Connection" first.',
      );
    }

    await this.prisma.$transaction([
      this.prisma.storageProfile.updateMany({
        where: { id: { not: id } },
        data: { isActive: false },
      }),
      this.prisma.storageProfile.update({
        where: { id },
        data: { isActive: true },
      }),
    ]);

    this.logger.log(`Storage profile activated: id=${id} name="${profile.name}" provider=${profile.providerType}`);
    return this.findOne(id);
  }

  async deactivate(id: string): Promise<ProfileResponse> {
    const profile = await this.prisma.storageProfile.findUnique({ where: { id } });
    if (!profile) throw new NotFoundException('Storage profile not found');

    await this.prisma.storageProfile.update({
      where: { id },
      data: { isActive: false },
    });
    return this.findOne(id);
  }

  async getActiveProfile(): Promise<StorageProfile | null> {
    return this.prisma.storageProfile.findFirst({ where: { isActive: true } });
  }

  async getProfileById(id: string): Promise<StorageProfile | null> {
    return this.prisma.storageProfile.findUnique({ where: { id } });
  }
}
