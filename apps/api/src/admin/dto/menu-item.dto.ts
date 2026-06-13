import { KitchenStation, MenuItemStatus } from '@prisma/client';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertMenuItemDto {
  @IsString()
  categoryId!: string;

  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsInt()
  @Min(0)
  price!: number;

  @IsEnum(KitchenStation)
  kitchenStation!: KitchenStation;

  @IsOptional()
  @IsEnum(MenuItemStatus)
  status?: MenuItemStatus;

  @IsOptional()
  @IsString()
  imageUrl?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;
}

