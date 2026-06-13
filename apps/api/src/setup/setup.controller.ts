import { Body, Controller, Get, Post } from '@nestjs/common';
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
  setupRestaurant(@Body() dto: SetupRestaurantDto) {
    return this.setupService.setupRestaurant(dto);
  }
}

