import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AuthModule } from '../auth/auth.module';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [AuthModule, MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } })],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}
