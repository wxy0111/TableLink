import { Module } from '@nestjs/common';
import { KitchenModule } from './kitchen/kitchen.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { ReportsModule } from './reports/reports.module';
import { ServiceModule } from './service/service.module';
import { SystemModule } from './system/system.module';
import { TablesModule } from './tables/tables.module';

@Module({
  imports: [PrismaModule, TablesModule, MenuModule, OrdersModule, KitchenModule, ServiceModule, ReportsModule, SystemModule],
})
export class AppModule {}
