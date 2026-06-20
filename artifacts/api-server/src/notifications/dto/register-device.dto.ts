import { IsBoolean, IsIn, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class RegisterDeviceDto {
  @IsString()
  @IsNotEmpty()
  expoPushToken!: string;

  @IsString()
  @IsIn(['ios', 'android'])
  platform!: 'ios' | 'android';

  @IsOptional()
  @IsString()
  deviceId?: string;

  @IsOptional()
  @IsBoolean()
  notifySubmissionUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewTasks?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyAppNotices?: boolean;
}

export class UpdatePreferencesDto {
  @IsString()
  @IsNotEmpty()
  expoPushToken!: string;

  @IsOptional()
  @IsBoolean()
  notifySubmissionUpdates?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyNewTasks?: boolean;

  @IsOptional()
  @IsBoolean()
  notifyAppNotices?: boolean;
}
