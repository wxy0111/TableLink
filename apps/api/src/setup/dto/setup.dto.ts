import { IsInt, IsOptional, IsString, Min } from 'class-validator';

export class SetupRestaurantDto {
  @IsString()
  restaurantName!: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  tableCount?: number;
}

