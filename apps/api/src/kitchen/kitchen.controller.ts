import { Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { KitchenStation, OrderItemStatus } from '@prisma/client';
import { KitchenService } from './kitchen.service';

@Controller('kitchen/orders')
export class KitchenController {
  constructor(private readonly kitchenService: KitchenService) {}

  @Get()
  findOrders(@Query('station') station?: KitchenStation, @Query('status') status?: OrderItemStatus) {
    return this.kitchenService.findOrders({ station, status });
  }

  @Get('tasks')
  findTasks(@Query('station') station?: KitchenStation) {
    return this.kitchenService.findTasks({ station });
  }

  @Patch('order-items/:orderItemId/start')
  startItem(@Param('orderItemId') orderItemId: string) {
    return this.kitchenService.startItem(orderItemId);
  }

  @Patch('order-items/:orderItemId/ready')
  markItemReady(@Param('orderItemId') orderItemId: string) {
    return this.kitchenService.markItemReady(orderItemId);
  }
}
