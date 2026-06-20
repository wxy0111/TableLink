import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class OpenShiftDto {
  @IsInt()
  @Min(0)
  openingCashAmount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}

export class CloseShiftDto {
  @IsInt()
  @Min(0)
  closingCashAmount!: number;

  @IsOptional()
  @IsString()
  note?: string;
}
