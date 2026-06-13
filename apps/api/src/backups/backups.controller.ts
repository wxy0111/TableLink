import { Body, Controller, Get, Post } from '@nestjs/common';
import { BackupsService } from './backups.service';

@Controller('admin/backups')
export class BackupsController {
  constructor(private readonly backupsService: BackupsService) {}

  @Get('export')
  exportBackup() {
    return this.backupsService.exportBackup();
  }

  @Post('restore')
  restoreBackup(@Body() backup: unknown) {
    return this.backupsService.restoreBackup(backup);
  }
}

