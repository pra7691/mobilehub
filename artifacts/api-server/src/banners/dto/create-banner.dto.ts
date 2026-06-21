import { IsString, IsOptional, IsBoolean, IsInt, IsDateString, IsUrl, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class CreateBannerDto {
  @IsString() @IsUrl() imageUrl!: string;

  @IsOptional() @IsString() @IsUrl() mobileImageUrl?: string;
  @IsOptional() @IsString() titleEn?: string;
  @IsOptional() @IsString() titleHi?: string;
  @IsOptional() @IsString() descriptionEn?: string;
  @IsOptional() @IsString() descriptionHi?: string;

  @IsOptional() @IsInt() @Min(0) @Type(() => Number) displayOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsDateString() startDate?: string;
  @IsOptional() @IsDateString() endDate?: string;
}
