import { Controller, Get, Query } from '@nestjs/common';
import { ReportsService, ReportPeriod } from './reports.service';

@Controller('admin/reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('summary')
  getSummary(@Query('period') period: ReportPeriod = 'daily', @Query('date') date?: string) {
    return this.reportsService.getSummary(period, date);
  }
}

