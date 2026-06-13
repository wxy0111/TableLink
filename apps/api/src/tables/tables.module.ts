import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PublicTablesController } from './tables.public.controller';
import { StaffTablesController } from './tables.staff.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [AuthModule],
  controllers: [PublicTablesController, StaffTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
