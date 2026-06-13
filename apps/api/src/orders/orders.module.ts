import { Module } from '@nestjs/common';
import { PublicOrdersController } from './orders.public.controller';
import { StaffOperationsController, StaffOrdersController } from './orders.staff.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [PublicOrdersController, StaffOrdersController, StaffOperationsController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
