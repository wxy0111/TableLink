import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { RealtimeModule } from '../realtime/realtime.module';
import { AdminController, StaffMenuItemsController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, RealtimeModule, MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } })],
  controllers: [AdminController, StaffMenuItemsController],
  providers: [AdminService],
})
export class AdminModule {}
