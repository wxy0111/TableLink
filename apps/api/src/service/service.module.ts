import { Module } from '@nestjs/common';
import { PublicServiceCallsController } from './service.public.controller';
import { ServiceController } from './service.controller';
import { ServiceTasksService } from './service.service';

@Module({
  controllers: [PublicServiceCallsController, ServiceController],
  providers: [ServiceTasksService],
})
export class ServiceModule {}

