import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { SetupRestaurantDto } from './dto/setup.dto';
import { SetupService } from './setup.service';

@Controller('setup')
export class SetupController {
  constructor(private readonly setupService: SetupService) {}

  @Get('status')
  getStatus() {
    return this.setupService.getStatus();
  }

  @Post('restaurant')
  @UseGuards(AuthGuard)
  @Roles('owner', 'manager')
  setupRestaurant(@Body() dto: SetupRestaurantDto) {
    return this.setupService.setupRestaurant(dto);
  }
}
