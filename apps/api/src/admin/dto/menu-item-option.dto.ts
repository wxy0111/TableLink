import { OptionType } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class MenuItemOptionValueDto {
  @IsString()
  name!: string;

  @IsInt()
  @Min(0)
  priceDelta!: number;
}

export class UpsertMenuItemOptionDto {
  @IsString()
  name!: string;

  @IsEnum(OptionType)
  type!: OptionType;

  @IsBoolean()
  required!: boolean;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuItemOptionValueDto)
  values!: MenuItemOptionValueDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

export class UpdateMenuItemOptionDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsEnum(OptionType)
  type?: OptionType;

  @IsOptional()
  @IsBoolean()
  required?: boolean;

  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => MenuItemOptionValueDto)
  values?: MenuItemOptionValueDto[];

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}
