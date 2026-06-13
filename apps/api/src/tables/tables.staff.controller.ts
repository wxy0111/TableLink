import { Controller, Get } from '@nestjs/common';
import { TablesService } from './tables.service';

@Controller('staff/tables')
export class StaffTablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get()
  findAll() {
    return this.tablesService.findAllForStaff();
  }
}

