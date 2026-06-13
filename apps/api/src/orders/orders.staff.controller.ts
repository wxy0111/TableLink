import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AddOrderItemDto, HoldOrderItemDto, ReasonDto, RefundPaymentDto } from './dto/frontdesk-order.dto';
import { OrdersService } from './orders.service';

@Controller('staff/orders')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier', 'waiter')
export class StaffOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':orderId/payments')
  createPayment(@Param('orderId') orderId: string, @Body() dto: CreatePaymentDto) {
    return this.ordersService.createPayment(orderId, dto);
  }

  @Post(':orderId/refunds')
  refundPayment(@Param('orderId') orderId: string, @Body() dto: RefundPaymentDto) {
    return this.ordersService.refundPayment(orderId, dto);
  }

  @Post(':orderId/items')
  addItem(@Param('orderId') orderId: string, @Body() dto: AddOrderItemDto) {
    return this.ordersService.addItem(orderId, dto);
  }

  @Patch(':orderId/items/:orderItemId/refund')
  refundItem(@Param('orderId') orderId: string, @Param('orderItemId') orderItemId: string, @Body() dto: ReasonDto) {
    return this.ordersService.refundItem(orderId, orderItemId, dto);
  }

  @Patch(':orderId/items/:orderItemId/urge')
  urgeItem(@Param('orderId') orderId: string, @Param('orderItemId') orderItemId: string, @Body() dto: ReasonDto) {
    return this.ordersService.urgeItem(orderId, orderItemId, dto);
  }

  @Patch(':orderId/items/:orderItemId/hold')
  holdItem(@Param('orderId') orderId: string, @Param('orderItemId') orderItemId: string, @Body() dto: HoldOrderItemDto) {
    return this.ordersService.holdItem(orderId, orderItemId, dto);
  }

}

@Controller('staff')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier', 'waiter')
export class StaffOperationsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get('audit-logs')
  findAuditLogs() {
    return this.ordersService.findAuditLogs();
  }

  @Get('print-jobs')
  findPrintJobs() {
    return this.ordersService.findPrintJobs();
  }
}
