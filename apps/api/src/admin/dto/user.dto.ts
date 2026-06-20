import { Role, UserStatus } from '@prisma/client';
import { IsEnum, IsOptional, IsString, Matches } from 'class-validator';

const pinMessage = 'PIN must be 4-8 digits';

export class CreateUserDto {
  @IsString()
  name!: string;

  @IsString()
  phone!: string;

  @IsEnum(Role)
  role!: Role;

  @Matches(/^\d{4,8}$/, { message: pinMessage })
  pin!: string;
}

export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  phone?: string;

  @IsOptional()
  @IsEnum(Role)
  role?: Role;

  @IsOptional()
  @IsEnum(UserStatus)
  status?: UserStatus;
}

export class ResetUserPinDto {
  @Matches(/^\d{4,8}$/, { message: pinMessage })
  pin!: string;
}
