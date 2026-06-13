import { IsString, Length } from 'class-validator';

export class LoginDto {
  @IsString()
  phone!: string;

  @IsString()
  @Length(4, 12)
  pin!: string;
}
