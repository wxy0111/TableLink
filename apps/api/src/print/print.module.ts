import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { PrintController } from './print.controller';
import { PrintService } from './print.service';

@Module({
  imports: [AuthModule, RealtimeModule],
  controllers: [PrintController],
  providers: [PrintService],
})
export class PrintModule {}
