import { GUARDS_METADATA } from '@nestjs/common/constants';
import { describe, expect, it } from 'vitest';
import { AuthGuard } from '../auth/auth.guard';
import { RealtimeController } from './realtime.controller';
import { RealtimeService } from './realtime.service';

describe('RealtimeService', () => {
  it('delivers published events to subscribers', async () => {
    const service = new RealtimeService();
    const received = new Promise((resolve) => {
      const subscription = service.subscribe().subscribe((event) => {
        subscription.unsubscribe();
        resolve(event);
      });
    });

    service.publish({ type: 'kitchen.updated' });

    await expect(received).resolves.toEqual({
      type: 'kitchen.updated',
      data: { type: 'kitchen.updated' },
    });
  });

  it('requires auth guard on the SSE stream controller', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, RealtimeController);

    expect(guards).toContain(AuthGuard);
  });
});
