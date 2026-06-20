import { IsEnum, IsInt, IsString, Min } from 'class-validator';

export const ORDER_ADJUSTMENT_TYPES = ['discount', 'rounding', 'comp', 'service_charge', 'adjustment'] as const;
export type OrderAdjustmentType = (typeof ORDER_ADJUSTMENT_TYPES)[number];

export class CreateOrderAdjustmentDto {
  @IsEnum(ORDER_ADJUSTMENT_TYPES)
  type!: OrderAdjustmentType;

  @IsInt()
  @Min(1)
  amount!: number;

  @IsString()
  reason!: string;
}
