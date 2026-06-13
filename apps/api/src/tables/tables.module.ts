import { Module } from '@nestjs/common';
import { PublicTablesController } from './tables.public.controller';
import { StaffTablesController } from './tables.staff.controller';
import { TablesService } from './tables.service';

@Module({
  controllers: [PublicTablesController, StaffTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}

