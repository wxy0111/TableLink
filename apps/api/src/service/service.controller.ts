import { Controller, Get, Param, Patch, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { ServiceTasksService } from './service.service';

@Controller('service')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'waiter')
export class ServiceController {
  constructor(private readonly serviceTasksService: ServiceTasksService) {}

  @Get('tasks')
  getTasks() {
    return this.serviceTasksService.getTasks();
  }

  @Patch('calls/:serviceCallId/acknowledge')
  acknowledgeCall(@Param('serviceCallId') serviceCallId: string) {
    return this.serviceTasksService.acknowledgeCall(serviceCallId);
  }

  @Patch('calls/:serviceCallId/resolve')
  resolveCall(@Param('serviceCallId') serviceCallId: string) {
    return this.serviceTasksService.resolveCall(serviceCallId);
  }

  @Patch('order-items/:orderItemId/served')
  markItemServed(@Param('orderItemId') orderItemId: string) {
    return this.serviceTasksService.markItemServed(orderItemId);
  }
}
