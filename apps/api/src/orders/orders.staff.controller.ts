import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { AddOrderItemDto, HoldOrderItemDto, ReasonDto, RefundPaymentDto } from './dto/frontdesk-order.dto';
import { CreateOrderAdjustmentDto } from './dto/order-adjustment.dto';
import { CreatePaymentIntentDto, MarkPaymentIntentPaidDto, MockPaymentWebhookDto } from './dto/payment-intent.dto';
import { ReopenOrderDto } from './dto/reopen-order.dto';
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

  @Post(':orderId/payment-intents')
  @Roles('owner', 'manager', 'cashier')
  createPaymentIntent(@Param('orderId') orderId: string, @Body() dto: CreatePaymentIntentDto) {
    return this.ordersService.createPaymentIntent(orderId, dto);
  }

  @Post(':orderId/refunds')
  refundPayment(@Param('orderId') orderId: string, @Body() dto: RefundPaymentDto) {
    return this.ordersService.refundPayment(orderId, dto);
  }

  @Post(':orderId/items')
  addItem(@Param('orderId') orderId: string, @Body() dto: AddOrderItemDto) {
    return this.ordersService.addItem(orderId, dto);
  }

  @Post(':orderId/adjustments')
  @Roles('owner', 'manager', 'cashier')
  createAdjustment(@Param('orderId') orderId: string, @Body() dto: CreateOrderAdjustmentDto) {
    return this.ordersService.createAdjustment(orderId, dto);
  }

  @Post(':orderId/reopen')
  @Roles('owner', 'manager')
  reopenOrder(@Param('orderId') orderId: string, @Body() dto: ReopenOrderDto) {
    return this.ordersService.reopenOrder(orderId, dto);
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

@Controller('staff/payment-intents')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier')
export class StaffPaymentIntentsController {
  constructor(private readonly ordersService: OrdersService) {}

  @Get(':paymentId')
  findPaymentIntent(@Param('paymentId') paymentId: string) {
    return this.ordersService.findPaymentIntent(paymentId);
  }

  @Post(':paymentId/mark-paid')
  markPaid(@Param('paymentId') paymentId: string, @Body() dto: MarkPaymentIntentPaidDto) {
    return this.ordersService.markPaymentIntentPaid(paymentId, dto);
  }

  @Post(':paymentId/close')
  close(@Param('paymentId') paymentId: string) {
    return this.ordersService.closePaymentIntent(paymentId);
  }
}

@Controller('payments/webhooks')
export class PaymentWebhookController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post('mock')
  mock(@Body() dto: MockPaymentWebhookDto) {
    return this.ordersService.handleMockPaymentWebhook(dto);
  }
}
