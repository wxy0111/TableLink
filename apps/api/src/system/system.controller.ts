import { Controller, Get } from '@nestjs/common';
import { SystemService } from './system.service';

@Controller('system')
export class SystemController {
  constructor(private readonly systemService: SystemService) {}

  @Get('local-access')
  getLocalAccess() {
    return this.systemService.getLocalAccess();
  }

  @Get('health')
  getHealth() {
    return this.systemService.getHealth();
  }
}
