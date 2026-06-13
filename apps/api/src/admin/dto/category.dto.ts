import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class UpsertCategoryDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sortOrder?: number;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

