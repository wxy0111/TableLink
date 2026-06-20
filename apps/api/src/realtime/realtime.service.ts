import { Injectable, MessageEvent } from '@nestjs/common';
import { Observable, Subject } from 'rxjs';

export type RealtimeEvent =
  | { type: 'kitchen.updated' }
  | { type: 'service.updated' }
  | { type: 'staff.tables.updated' }
  | { type: 'admin.reports.updated' }
  | { type: 'print.updated' }
  | { type: 'menu.updated' };

@Injectable()
export class RealtimeService {
  private readonly events = new Subject<MessageEvent>();

  publish(event: RealtimeEvent) {
    this.events.next({ type: event.type, data: event });
  }

  subscribe(): Observable<MessageEvent> {
    return this.events.asObservable();
  }
}
