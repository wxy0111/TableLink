import { Controller, Get, Param } from '@nestjs/common';
import { TablesService } from './tables.service';

@Controller('public/tables')
export class PublicTablesController {
  constructor(private readonly tablesService: TablesService) {}

  @Get(':code')
  findByCode(@Param('code') code: string) {
    return this.tablesService.findByCode(code);
  }
}

