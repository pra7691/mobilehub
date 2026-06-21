import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { IsArray, IsOptional, IsString } from 'class-validator';
import { AdminJwtGuard } from '../auth/guards/admin-jwt.guard';
import { TranslateService } from './translate.service';

export class TranslateDto {
  @IsOptional()
  @IsString()
  text?: string;

  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  texts?: string[];
}

@Controller('admin/translate')
@UseGuards(AdminJwtGuard)
export class TranslateController {
  constructor(private readonly translateService: TranslateService) {}

  @Post()
  async translate(@Body() dto: TranslateDto) {
    if (dto.texts && dto.texts.length > 0) {
      const translations = await this.translateService.translateBatch(dto.texts);
      return { translations };
    }
    if (dto.text) {
      const translation = await this.translateService.translateOne(dto.text);
      return { translation };
    }
    return { translation: '', translations: [] };
  }
}
