import { Controller, Sse, UseGuards } from '@nestjs/common';
import { AuthGuard } from '../auth/auth.guard';
import { RealtimeService } from './realtime.service';

@Controller('events')
@UseGuards(AuthGuard)
export class RealtimeController {
  constructor(private readonly realtime: RealtimeService) {}

  @Sse('stream')
  stream() {
    return this.realtime.subscribe();
  }
}
