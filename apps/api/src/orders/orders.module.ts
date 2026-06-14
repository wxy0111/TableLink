import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PublicOrdersController } from './orders.public.controller';
import { StaffOperationsController, StaffOrdersController } from './orders.staff.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, LedgerModule, WorkflowModule],
  controllers: [PublicOrdersController, StaffOrdersController, StaffOperationsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
