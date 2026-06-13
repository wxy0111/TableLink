import { Type } from 'class-transformer';
import { IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';
import { PaymentMethod } from '@prisma/client';

class SelectedOptionDto {
  @IsString()
  optionName!: string;

  @IsString()
  valueName!: string;
}

export class AddOrderItemDto {
  @IsString()
  menuItemId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => SelectedOptionDto)
  options: SelectedOptionDto[] = [];
}

export class ReasonDto {
  @IsOptional()
  @IsString()
  reason?: string;
}

export class HoldOrderItemDto extends ReasonDto {
  @IsBoolean()
  hold!: boolean;
}

export class RefundPaymentDto extends ReasonDto {
  @IsEnum(PaymentMethod)
  method!: PaymentMethod;

  @IsInt()
  @Min(1)
  amount!: number;
}
