import { Injectable } from '@nestjs/common';
import { randomUUID } from 'crypto';
import { mkdir, rm, writeFile } from 'fs/promises';
import { networkInterfaces } from 'os';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class SystemService {
  constructor(private readonly prisma: PrismaService) {}

  getLocalAccess() {
    const webPort = Number(process.env.WEB_PORT ?? 3000);
    const apiPort = Number(process.env.API_PORT ?? 3001);
    const addresses = Object.entries(networkInterfaces()).flatMap(([name, interfaces]) => {
      return (interfaces ?? [])
        .filter((item) => item.family === 'IPv4' && !item.internal)
        .map((item) => ({
          name,
          address: item.address,
          webUrl: `http://${item.address}:${webPort}`,
          apiUrl: `http://${item.address}:${apiPort}`,
        }));
    });

    return {
      webPort,
      apiPort,
      addresses,
    };
  }

  async getHealth() {
    const errors: string[] = [];
    let database: 'ok' | 'error' = 'ok';
    let storage: 'ok' | 'error' = 'ok';

    try {
      await this.prisma.restaurant.count();
    } catch (caught) {
      database = 'error';
      errors.push(`database: ${caught instanceof Error ? caught.message : 'unavailable'}`);
    }

    storage = await this.checkStorage();
    if (storage !== 'ok') {
      errors.push('storage: uploads directory is not writable');
    }

    const version = process.env.npm_package_version ?? '0.0.0-local';

    return {
      api: errors.length ? 'degraded' : 'ok',
      database,
      realtime: 'ok',
      storage,
      version,
      checkedAt: new Date().toISOString(),
      environment: {
        nodeEnv: process.env.NODE_ENV ?? 'development',
        apiPort: Number(process.env.API_PORT ?? 3001),
        webPort: Number(process.env.WEB_PORT ?? 3000),
        hasDatabaseUrl: Boolean(process.env.DATABASE_URL),
        hasAuthSecret: Boolean(process.env.AUTH_SECRET),
      },
      errors,
    };
  }

  async checkStorage(): Promise<'ok' | 'error'> {
    const uploadsDir = join(process.cwd(), '..', '..', 'data', 'uploads', 'menu');
    const probeFile = join(uploadsDir, `.health-${randomUUID()}.tmp`);

    try {
      await mkdir(uploadsDir, { recursive: true });
      await writeFile(probeFile, 'ok');
      await rm(probeFile, { force: true });
      return 'ok';
    } catch {
      return 'error';
    }
  }
}
