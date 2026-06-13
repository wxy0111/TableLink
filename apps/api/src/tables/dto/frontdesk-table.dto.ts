import { IsOptional, IsString } from 'class-validator';

export class OpenTableDto {
  @IsOptional()
  @IsString()
  note?: string;
}

export class MoveTableDto {
  @IsString()
  targetTableId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class MergeTablesDto {
  @IsString()
  sourceTableId!: string;

  @IsString()
  targetTableId!: string;

  @IsOptional()
  @IsString()
  reason?: string;
}

export class ClearTableDto {
  @IsOptional()
  @IsString()
  reason?: string;
}
