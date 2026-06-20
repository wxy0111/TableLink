import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { LedgerModule } from '../ledger/ledger.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PublicOrdersController } from './orders.public.controller';
import { PaymentWebhookController, StaffOperationsController, StaffOrdersController, StaffPaymentIntentsController } from './orders.staff.controller';
import { OrdersService } from './orders.service';

@Module({
  imports: [AuthModule, LedgerModule, WorkflowModule, RealtimeModule],
  controllers: [PublicOrdersController, StaffOrdersController, StaffOperationsController, StaffPaymentIntentsController, PaymentWebhookController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
