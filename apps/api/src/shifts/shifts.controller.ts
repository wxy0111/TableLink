import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { AuthenticatedRequest, AuthGuard } from '../auth/auth.guard';
import { Roles } from '../auth/roles.decorator';
import { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';
import { ShiftsService } from './shifts.service';

@Controller('staff/shifts')
@UseGuards(AuthGuard)
@Roles('owner', 'manager', 'cashier')
export class StaffShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Post('open')
  open(@Req() request: AuthenticatedRequest, @Body() dto: OpenShiftDto) {
    return this.shifts.open(request.user!, dto);
  }

  @Post(':shiftId/close')
  close(@Req() request: AuthenticatedRequest, @Param('shiftId') shiftId: string, @Body() dto: CloseShiftDto) {
    return this.shifts.close(request.user!, shiftId, dto);
  }

  @Get('current')
  current(@Req() request: AuthenticatedRequest) {
    return this.shifts.getCurrent(request.user!.restaurantId);
  }
}

@Controller('admin/shifts')
@UseGuards(AuthGuard)
@Roles('owner', 'manager')
export class AdminShiftsController {
  constructor(private readonly shifts: ShiftsService) {}

  @Get()
  findAll(@Req() request: AuthenticatedRequest) {
    return this.shifts.findAll(request.user!.restaurantId);
  }
}
