import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { ReportsService, ReportPeriod } from './reports.service';

@Controller('admin/reports')
@UseGuards(AuthGuard)
@Roles('owner', 'manager')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@Query('period') period: ReportPeriod = 'daily', @Query('date') date?: string) {
    return this.reportsService.getSummary(period, date);
  }

  @Get('daily-closing')
  getDailyClosing(@Query('date') date?: string) {
    return this.reportsService.getDailyClosing(date);
  }
}
