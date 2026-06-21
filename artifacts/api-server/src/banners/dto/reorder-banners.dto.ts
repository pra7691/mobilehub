import { IsArray, IsString, IsInt, Min, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

class ReorderItem {
  @IsString() id!: string;
  @IsInt() @Min(0) displayOrder!: number;
}

export class ReorderBannersDto {
  @IsArray() @ValidateNested({ each: true }) @Type(() => ReorderItem)
  items!: ReorderItem[];
}
