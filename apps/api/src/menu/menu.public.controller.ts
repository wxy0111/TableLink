import { Controller, Get, Param } from '@nestjs/common';
import { MenuService } from './menu.service';

@Controller('public/restaurants/:restaurantId/menu')
export class MenuController {
  constructor(private readonly menuService: MenuService) {}

  @Get()
  findMenu(@Param('restaurantId') restaurantId: string) {
    return this.menuService.findPublicMenu(restaurantId);
  }
}

