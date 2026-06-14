import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { WorkflowModule } from '../workflow/workflow.module';
import { KitchenController } from './kitchen.controller';
import { KitchenService } from './kitchen.service';

@Module({
  imports: [AuthModule, WorkflowModule],
  controllers: [KitchenController],
  providers: [KitchenService],
})
export class KitchenModule {}
