import { Body, Controller, Param, Post } from '@nestjs/common';
import { CreatePaymentDto } from './dto/create-payment.dto';
import { OrdersService } from './orders.service';

@Controller('staff/orders')
export class StaffOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post(':orderId/payments')
  createPayment(@Param('orderId') orderId: string, @Body() dto: CreatePaymentDto) {
    return this.ordersService.createPayment(orderId, dto);
  }
}

