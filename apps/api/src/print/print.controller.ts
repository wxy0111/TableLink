import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { PrintJobStatus } from '@prisma/client';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { PrintService } from './print.service';

@Controller('staff/print-jobs')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier', 'waiter', 'kitchen')
export class PrintController {
  constructor(private readonly print: PrintService) {}

  @Get()
  findMany(@Query('status') status?: PrintJobStatus) {
    return this.print.findMany(status);
  }

  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.print.findOne(id);
  }

  @Post(':id/mark-printed')
  markPrinted(@Param('id') id: string) {
    return this.print.markPrinted(id);
  }

  @Post(':id/mark-failed')
  markFailed(@Param('id') id: string, @Body() dto: { error?: string }) {
    return this.print.markFailed(id, dto);
  }

  @Post(':id/retry')
  retry(@Param('id') id: string) {
    return this.print.retry(id);
  }
}
