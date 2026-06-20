import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

@Module({
  imports: [AuthModule, WorkflowModule, RealtimeModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
