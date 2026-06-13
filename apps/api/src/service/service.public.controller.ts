import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { CreateServiceCallDto } from './dto/create-service-call.dto';
import { ServiceTasksService } from './service.service';

@Controller('public/tables/:code/service-calls')
export class PublicServiceCallsController {
  constructor(private readonly serviceTasksService: ServiceTasksService) {}

  @Get('current')
  getCurrent(@Param('code') code: string) {
    return this.serviceTasksService.getCurrentServiceCall(code);
  }

  @Post()
  create(@Param('code') code: string, @Body() dto: CreateServiceCallDto) {
    return this.serviceTasksService.createServiceCall(code, dto);
  }
}

