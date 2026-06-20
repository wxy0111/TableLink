import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StaffShiftsController, AdminShiftsController } from './shifts.controller';
import { ShiftsService } from './shifts.service';

@Module({
  imports: [AuthModule],
  controllers: [StaffShiftsController, AdminShiftsController],
  providers: [ShiftsService],
  exports: [ShiftsService],
})
export class ShiftsModule {}
