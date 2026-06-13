'use client';

import { FormEvent, useState } from 'react';

type TableRecord = {
  id: string;
  name: string;
  code: string;
  capacity: number;
  tableUrl: string;
  qrDataUrl: string;
};

export function TablesManagerClient({ initialTables }: { initialTables: TableRecord[] }) {
  const [tables, setTables] = useState(initialTables);
  const [form, setForm] = useState({ name: '', capacity: 4 });
  const [message, setMessage] = useState('');

  async function refresh() {
    const response = await fetch('/api/admin/tables', { cache: 'no-store' });
    if (response.ok) setTables(await response.json());
  }

  async function createTable(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/admin/tables', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(form),
    });

    if (!response.ok) {
      setMessage('桌台创建失败');
      return;
    }

    setMessage('桌台已创建');
    setForm({ name: '', capacity: 4 });
    await refresh();
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">桌台二维码</div>
          <p className="muted">打印二维码后贴到桌面，顾客扫码进入对应桌台。</p>
        </div>
        <nav className="nav">
          <a href="/admin">报表</a>
          <a href="/admin/menu">菜品</a>
          <a href="/admin/backups">备份恢复</a>
        </nav>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <form className="card inline-form" onSubmit={createTable}>
        <input placeholder="桌台名，例如 A12" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
        <input type="number" min={1} value={form.capacity} onChange={(event) => setForm({ ...form, capacity: Number(event.target.value) })} />
        <button className="button" type="submit">
          新增桌台
        </button>
      </form>

      <section className="qr-grid">
        {tables.map((table) => (
          <article className="qr-card" key={table.id}>
            <h2>{table.name}</h2>
            <img src={table.qrDataUrl} alt={`${table.name} 二维码`} />
            <code>{table.tableUrl}</code>
            <p className="muted">Code: {table.code} / {table.capacity} 人桌</p>
          </article>
        ))}
      </section>
    </main>
  );
}

