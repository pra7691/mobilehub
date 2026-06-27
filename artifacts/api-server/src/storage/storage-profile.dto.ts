import {
  IsString,
  IsOptional,
  IsIn,
  IsBoolean,
  MaxLength,
  IsUrl,
  IsNotEmpty,
} from 'class-validator';

const PROVIDER_TYPES = ['REPLIT', 'AWS_S3', 'CLOUDFLARE_R2', 'DIGITALOCEAN_SPACES'] as const;
export type StorageProviderTypeValue = (typeof PROVIDER_TYPES)[number];

export class CreateStorageProfileDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name!: string;

  @IsIn(PROVIDER_TYPES)
  providerType!: StorageProviderTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  publicBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secretAccessKey?: string;
}

export class UpdateStorageProfileDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  @MaxLength(100)
  name?: string;

  @IsOptional()
  @IsIn(PROVIDER_TYPES)
  providerType?: StorageProviderTypeValue;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  bucket?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  region?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  endpoint?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  publicBaseUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  keyPrefix?: string;

  @IsOptional()
  @IsString()
  @MaxLength(200)
  accessKeyId?: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  secretAccessKey?: string;
}
