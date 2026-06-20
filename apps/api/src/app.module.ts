import { Module } from '@nestjs/common';
import { AdminModule } from './admin/admin.module';
import { AuthModule } from './auth/auth.module';
import { BackupsModule } from './backups/backups.module';
import { KitchenModule } from './kitchen/kitchen.module';
import { LedgerModule } from './ledger/ledger.module';
import { MenuModule } from './menu/menu.module';
import { OrdersModule } from './orders/orders.module';
import { PrismaModule } from './prisma/prisma.module';
import { PrintModule } from './print/print.module';
import { ReportsModule } from './reports/reports.module';
import { RealtimeModule } from './realtime/realtime.module';
import { ServiceModule } from './service/service.module';
import { SetupModule } from './setup/setup.module';
import { ShiftsModule } from './shifts/shifts.module';
import { SystemModule } from './system/system.module';
import { TablesModule } from './tables/tables.module';
import { WorkflowModule } from './workflow/workflow.module';

@Module({
  imports: [
    PrismaModule,
    PrintModule,
    AuthModule,
    LedgerModule,
    WorkflowModule,
    TablesModule,
    MenuModule,
    OrdersModule,
    KitchenModule,
    ServiceModule,
    ReportsModule,
    RealtimeModule,
    SystemModule,
    AdminModule,
    SetupModule,
    ShiftsModule,
    BackupsModule,
  ],
})
export class AppModule {}
