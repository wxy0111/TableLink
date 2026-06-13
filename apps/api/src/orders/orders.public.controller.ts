import { Body, Controller, Get, Param, Post } from '@nestjs/common';
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
  findOne(@Param('orderId') orderId: string) {
    return this.ordersService.findOne(orderId);
  }
}

