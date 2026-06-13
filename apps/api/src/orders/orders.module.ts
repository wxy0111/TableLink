import { Module } from '@nestjs/common';
import { PublicOrdersController } from './orders.public.controller';
import { StaffOrdersController } from './orders.staff.controller';
import { OrdersService } from './orders.service';

@Module({
  controllers: [PublicOrdersController, StaffOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
