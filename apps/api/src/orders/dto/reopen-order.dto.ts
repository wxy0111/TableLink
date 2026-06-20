import { IsNotEmpty, IsString } from 'class-validator';

export class ReopenOrderDto {
  @IsString()
  @IsNotEmpty()
  reason!: string;
}
