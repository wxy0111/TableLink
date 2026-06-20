'use client';

import { useRouter } from 'next/navigation';
import { useRealtimeEvents } from '../use-realtime-events';

export function AdminRealtimeRefresh() {
  const router = useRouter();

  useRealtimeEvents(['admin.reports.updated'], () => {
    router.refresh();
  });

  return null;
}
