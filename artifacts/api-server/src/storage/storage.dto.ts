import { IsString, IsNumber, IsOptional } from 'class-validator';

export class RequestUploadUrlDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsNumber()
  @IsOptional()
  size?: number;

  @IsString()
  @IsOptional()
  contentType?: string;
}
