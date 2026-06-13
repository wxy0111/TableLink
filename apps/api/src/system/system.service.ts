import { Injectable } from '@nestjs/common';
import { networkInterfaces } from 'os';

@Injectable()
export class SystemService {
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
}

