import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { PublicServiceCallsController } from './service.public.controller';
import { ServiceController } from './service.controller';
import { ServiceTasksService } from './service.service';

@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [PublicServiceCallsController, ServiceController],
  providers: [ServiceTasksService],
})
export class ServiceModule {}
