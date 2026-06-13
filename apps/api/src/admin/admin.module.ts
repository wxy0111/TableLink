import { Module } from '@nestjs/common';
import { MulterModule } from '@nestjs/platform-express';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  imports: [MulterModule.register({ limits: { fileSize: 5 * 1024 * 1024 } })],
  controllers: [AdminController],
  providers: [AdminService],
})
export class AdminModule {}

