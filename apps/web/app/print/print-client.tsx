'use client';

import { CheckCircle2, Printer, RefreshCcw, RotateCcw, XCircle } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRealtimeEvents } from '../use-realtime-events';

type PrintJob = {
  id: string;
  jobType: string;
  status: 'pending' | 'printed' | 'failed' | 'cancelled';
  title: string;
  payload: Record<string, unknown>;
  attempts: number;
  lastError: string | null;
  createdAt: string;
  printedAt: string | null;
  table?: { name: string } | null;
  order?: { orderNo: string } | null;
  orderItem?: { nameSnapshot: string; quantity: number; remark: string | null; kitchenStation: string } | null;
};

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.message ?? 'Print action failed');
  return body;
}

function text(value: unknown) {
  return typeof value === 'string' ? value : '';
}

function money(value: unknown) {
  return typeof value === 'number' ? (value / 100).toFixed(2) : '';
}

function time(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString('zh-CN') : new Date().toLocaleString('zh-CN');
}

export function PrintClient({ initialJobs }: { initialJobs: PrintJob[] }) {
  const [jobs, setJobs] = useState(initialJobs);
  const [selectedId, setSelectedId] = useState(initialJobs[0]?.id ?? '');
  const [message, setMessage] = useState('');

  const selectedJob = useMemo(() => jobs.find((job) => job.id === selectedId) ?? jobs[0] ?? null, [jobs, selectedId]);
  const pending = jobs.filter((job) => job.status === 'pending');
  const failed = jobs.filter((job) => job.status === 'failed');

  async function refreshJobs() {
    const nextJobs = (await request('/api/staff/print-jobs')) as PrintJob[];
    setJobs(nextJobs);
    if (!selectedId && nextJobs[0]) setSelectedId(nextJobs[0].id);
  }

  useRealtimeEvents(['print.updated'], refreshJobs);

  async function run(label: string, action: () => Promise<void>) {
    setMessage('');
    try {
      await action();
      setMessage(label);
      await refreshJobs();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : 'Print action failed');
    }
  }

  return (
    <main className="shell print-page">
      <header className="topbar no-print">
        <div>
          <div className="brand">Print jobs</div>
          <p className="muted">Pending {pending.length} / Failed {failed.length} / Total {jobs.length}</p>
        </div>
        <button className="button" type="button" onClick={refreshJobs}>
          <RefreshCcw size={16} />
          Refresh
        </button>
      </header>

      {message ? <div className="notice-box no-print">{message}</div> : null}

      <section className="admin-grid print-workspace">
        <aside className="card no-print">
          <h2>Tasks</h2>
          <div className="grid">
            {jobs.map((job) => (
              <button className="button" type="button" key={job.id} onClick={() => setSelectedId(job.id)}>
                {job.status} / {job.title}
              </button>
            ))}
          </div>
        </aside>

        <section className="card print-surface">
          {selectedJob ? <Ticket job={selectedJob} /> : <div className="empty-state">No print jobs</div>}
          {selectedJob ? (
            <div className="payment-actions no-print">
              <button className="button" type="button" onClick={() => window.print()}>
                <Printer size={16} />
                Browser print
              </button>
              <button className="button" type="button" onClick={() => run('Marked printed', () => request(`/api/staff/print-jobs/${selectedJob.id}/mark-printed`, { method: 'POST' }))}>
                <CheckCircle2 size={16} />
                Mark printed
              </button>
              <button className="button danger-button" type="button" onClick={() => run('Marked failed', () => request(`/api/staff/print-jobs/${selectedJob.id}/mark-failed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ error: 'manual failed' }) }))}>
                <XCircle size={16} />
                Mark failed
              </button>
              <button className="button" type="button" disabled={selectedJob.status !== 'failed'} onClick={() => run('Retried', () => request(`/api/staff/print-jobs/${selectedJob.id}/retry`, { method: 'POST' }))}>
                <RotateCcw size={16} />
                Retry
              </button>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
}

function Ticket({ job }: { job: PrintJob }) {
  const payload = job.payload ?? {};
  const title = job.jobType.startsWith('receipt') ? 'Receipt' : job.jobType.includes('refund') ? 'Kitchen change' : 'Kitchen ticket';
  const items = Array.isArray(payload.items) ? payload.items : [];

  return (
    <article className="ticket-print">
      <h1>{title}</h1>
      <p>{job.title}</p>
      <hr />
      <p>Table: {text(payload.tableName) || job.table?.name || '-'}</p>
      <p>Order: {text(payload.orderNo) || job.order?.orderNo || '-'}</p>
      <p>Type: {job.jobType}</p>
      <p>Time: {time(job.createdAt)}</p>
      <hr />
      {items.length ? (
        <div>
          {items.map((item, index) => {
            const row = item as Record<string, unknown>;
            return (
              <p key={index}>
                {text(row.name)} x {String(row.quantity ?? '')} {text(row.kitchenStation)}
                {row.remark ? ` / ${text(row.remark)}` : ''}
              </p>
            );
          })}
        </div>
      ) : (
        <div>
          <p>Item: {text(payload.itemName) || job.orderItem?.nameSnapshot || '-'}</p>
          <p>Quantity: {String(payload.quantity ?? job.orderItem?.quantity ?? '')}</p>
          <p>Method: {text(payload.method) || '-'}</p>
          <p>Amount: {money(payload.amount)}</p>
          <p>Reason: {text(payload.reason) || text(payload.note) || '-'}</p>
          <p>Station: {text(payload.kitchenStation) || job.orderItem?.kitchenStation || '-'}</p>
        </div>
      )}
      <hr />
      <p>Status: {job.status}</p>
      {job.lastError ? <p>Error: {job.lastError}</p> : null}
    </article>
  );
}
