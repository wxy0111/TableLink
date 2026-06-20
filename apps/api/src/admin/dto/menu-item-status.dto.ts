import { MenuItemStatus } from '@prisma/client';
import { IsEnum } from 'class-validator';

export class UpdateMenuItemStatusDto {
  @IsEnum(MenuItemStatus)
  status!: MenuItemStatus;
}
