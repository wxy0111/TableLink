import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { AuthUser } from '../auth/auth.service';
import { PrismaService } from '../prisma/prisma.service';
import { CloseShiftDto, OpenShiftDto } from './dto/shift.dto';

@Injectable()
export class ShiftsService {
  constructor(private readonly prisma: PrismaService) {}

  getCurrent(restaurantId: string) {
    return this.prisma.shift.findFirst({
      where: { restaurantId, status: 'open' },
      orderBy: { openedAt: 'desc' },
      include: { openedBy: true, closedBy: true },
    });
  }

  findAll(restaurantId: string) {
    return this.prisma.shift.findMany({
      where: { restaurantId },
      orderBy: { openedAt: 'desc' },
      take: 100,
      include: { openedBy: true, closedBy: true },
    });
  }

  async open(user: AuthUser, dto: OpenShiftDto) {
    const current = await this.getCurrent(user.restaurantId);
    if (current) {
      throw new BadRequestException('A shift is already open');
    }

    return this.prisma.shift.create({
      data: {
        restaurantId: user.restaurantId,
        openedByUserId: user.id,
        openingCashAmount: dto.openingCashAmount,
        note: dto.note,
        status: 'open',
      },
      include: { openedBy: true, closedBy: true },
    });
  }

  async close(user: AuthUser, shiftId: string, dto: CloseShiftDto) {
    const shift = await this.prisma.shift.findFirst({
      where: { id: shiftId, restaurantId: user.restaurantId },
    });
    if (!shift) {
      throw new NotFoundException('Shift not found');
    }
    if (shift.status !== 'open') {
      throw new BadRequestException('Shift is already closed');
    }

    return this.prisma.shift.update({
      where: { id: shiftId },
      data: {
        status: 'closed',
        closedByUserId: user.id,
        closedAt: new Date(),
        closingCashAmount: dto.closingCashAmount,
        note: dto.note ?? shift.note,
      },
      include: { openedBy: true, closedBy: true },
    });
  }
}
