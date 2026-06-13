import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateTableDto {
  @IsString()
  name!: string;

  @IsOptional()
  @IsString()
  code?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  capacity?: number;
}

