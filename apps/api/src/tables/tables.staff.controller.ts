import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { TablesService } from './tables.service';
import { ClearTableDto, MergeTablesDto, MoveTableDto, OpenTableDto } from './dto/frontdesk-table.dto';

@Controller('staff/tables')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier', 'waiter')
export class StaffTablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll() {
    return this.tablesService.findAllForStaff();
  }

  @Post(':tableId/open')
  openTable(@Param('tableId') tableId: string, @Body() dto: OpenTableDto) {
    return this.tablesService.openTable(tableId, dto);
  }

  @Patch(':tableId/move')
  moveTable(@Param('tableId') tableId: string, @Body() dto: MoveTableDto) {
    return this.tablesService.moveTable(tableId, dto);
  }

  @Post('merge')
  mergeTables(@Body() dto: MergeTablesDto) {
    return this.tablesService.mergeTables(dto);
  }

  @Post(':tableId/clear')
  clearTable(@Param('tableId') tableId: string, @Body() dto: ClearTableDto) {
    return this.tablesService.clearTable(tableId, dto);
  }
}
