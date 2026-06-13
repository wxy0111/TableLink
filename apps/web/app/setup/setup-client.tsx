'use client';

import { useState } from 'react';

type SetupStatus = {
  initialized: boolean;
  restaurant?: { name: string } | null;
  counts: { tables: number; categories: number; menuItems: number };
};

export function SetupClient({ initialStatus }: { initialStatus: SetupStatus | null }) {
  const [restaurantName, setRestaurantName] = useState(initialStatus?.restaurant?.name ?? '我的饭店');
  const [tableCount, setTableCount] = useState(initialStatus?.counts.tables || 10);
  const [status, setStatus] = useState(initialStatus);
  const [message, setMessage] = useState('');

  async function submit() {
    const response = await fetch('/api/setup/restaurant', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ restaurantName, tableCount }),
    });

    if (!response.ok) {
      setMessage('初始化失败');
      return;
    }

    const restaurant = await response.json();
    setStatus({
      initialized: true,
      restaurant,
      counts: {
        tables: restaurant.tables.length,
        categories: restaurant.categories.length,
        menuItems: restaurant.menuItems.length,
      },
    });
    setMessage('初始化已保存');
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">初始化向导</div>
          <p className="muted">第一次安装后，先设置店铺和桌台。</p>
        </div>
        <a className="button" href="/admin">
          进入后台
        </a>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="form-panel">
        <label>
          店铺名称
          <input value={restaurantName} onChange={(event) => setRestaurantName(event.target.value)} />
        </label>
        <label>
          桌台数量
          <input type="number" min={1} value={tableCount} onChange={(event) => setTableCount(Number(event.target.value))} />
        </label>
        <button className="primary-button" type="button" onClick={submit}>
          保存初始化配置
        </button>
      </section>

      {status ? (
        <section className="metric-grid">
          <article className="metric-card">
            <span className="muted">桌台</span>
            <strong>{status.counts.tables}</strong>
          </article>
          <article className="metric-card">
            <span className="muted">分类</span>
            <strong>{status.counts.categories}</strong>
          </article>
          <article className="metric-card">
            <span className="muted">菜品</span>
            <strong>{status.counts.menuItems}</strong>
          </article>
        </section>
      ) : null}
    </main>
  );
}

