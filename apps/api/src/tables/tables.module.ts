import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PublicTablesController } from './tables.public.controller';
import { StaffTablesController } from './tables.staff.controller';
import { TablesService } from './tables.service';

@Module({
  imports: [AuthModule, WorkflowModule, RealtimeModule],
  controllers: [PublicTablesController, StaffTablesController],
  providers: [TablesService],
  exports: [TablesService],
})
export class TablesModule {}
