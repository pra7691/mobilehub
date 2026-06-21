import { IsBoolean } from 'class-validator';

export class UpdateBannerStatusDto {
  @IsBoolean() isActive!: boolean;
}
