import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateServiceCallDto {
  @IsOptional()
  @IsString()
  @MaxLength(120)
  message?: string;
}

