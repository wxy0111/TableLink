import { Body, Controller, Get, Headers, Param, Post, Query } from '@nestjs/common';
import { CreateOrderDto } from './dto/create-order.dto';
import { OrdersService } from './orders.service';

@Controller('public/orders')
export class PublicOrdersController {
  constructor(private readonly ordersService: OrdersService) {}

  @Post()
  create(@Body() dto: CreateOrderDto) {
    return this.ordersService.createCustomerOrder(dto);
  }

  @Get(':orderId')
  findOne(
    @Param('orderId') orderId: string,
    @Query('token') queryToken?: string,
    @Headers('x-customer-order-token') headerToken?: string,
  ) {
    return this.ordersService.findPublicOne(orderId, queryToken ?? headerToken);
  }
}
