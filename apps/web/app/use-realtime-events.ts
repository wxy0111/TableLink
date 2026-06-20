'use client';

import { useEffect, useRef } from 'react';

type RealtimeEventType =
  | 'kitchen.updated'
  | 'service.updated'
  | 'staff.tables.updated'
  | 'admin.reports.updated'
  | 'print.updated'
  | 'menu.updated';

type RealtimeEvent = {
  type: RealtimeEventType;
};

export function useRealtimeEvents(eventTypes: RealtimeEventType[], onEvent: (event: RealtimeEvent) => void) {
  const callbackRef = useRef(onEvent);
  const eventTypeKey = eventTypes.join(',');

  useEffect(() => {
    callbackRef.current = onEvent;
  }, [onEvent]);

  useEffect(() => {
    const eventSource = new EventSource('/api/events/stream', { withCredentials: true });
    const acceptedTypes = eventTypeKey.split(',') as RealtimeEventType[];

    for (const type of acceptedTypes) {
      eventSource.addEventListener(type, (message) => {
        callbackRef.current(JSON.parse((message as MessageEvent).data) as RealtimeEvent);
      });
    }

    return () => eventSource.close();
  }, [eventTypeKey]);
}
