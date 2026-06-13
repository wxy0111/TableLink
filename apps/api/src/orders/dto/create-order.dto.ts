import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsInt, IsOptional, IsString, Min, ValidateNested } from 'class-validator';

class SelectedOptionDto {
  @IsString()
  optionName!: string;

  @IsString()
  valueName!: string;
}

class CreateOrderItemDto {
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

export class CreateOrderDto {
  @IsString()
  tableCode!: string;

  @IsOptional()
  @IsString()
  remark?: string;

  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => CreateOrderItemDto)
  items!: CreateOrderItemDto[];
}

