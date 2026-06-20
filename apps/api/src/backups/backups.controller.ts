import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { BackupsService } from './backups.service';

@Controller('admin/backups')
@UseGuards(AuthGuard)
@Roles('owner', 'manager')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('export')
  exportBackup() {
    return this.backupsService.exportBackup();
  }

  @Post('restore')
  restoreBackup(@Body() request: unknown) {
    return this.backupsService.restoreBackup(request);
  }
}
