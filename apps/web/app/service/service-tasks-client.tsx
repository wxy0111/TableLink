'use client';

import { Bell, Check, RefreshCcw, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';

type ServiceCall = {
  id: string;
  tableName: string;
  orderNo: string | null;
  status: 'open' | 'acknowledged';
  message: string | null;
  waitMinutes: number;
};

type ReadyItem = {
  id: string;
  tableName: string;
  orderNo: string;
  name: string;
  quantity: number;
  remark: string | null;
  waitMinutes: number;
};

type ServiceTasks = {
  calls: ServiceCall[];
  readyItems: ReadyItem[];
};

export function ServiceTasksClient({ initialTasks }: { initialTasks: ServiceTasks }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const totalTasks = useMemo(() => tasks.calls.length + tasks.readyItems.length, [tasks]);

  async function refreshTasks() {
    const response = await fetch('/api/service/tasks', { cache: 'no-store' });
    if (!response.ok) return;
    setTasks(await response.json());
  }

  async function patch(path: string, success: string, id: string) {
    setBusyId(id);
    setMessage('');
    try {
      const response = await fetch(path, { method: 'PATCH' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '操作失败');
      }
      setMessage(success);
      await refreshTasks();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">服务员面板</div>
          <p className="muted">待处理任务 {totalTasks} 个：顾客呼叫和已出餐菜品</p>
        </div>
        <button className="button" type="button" onClick={refreshTasks}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="admin-grid">
        <article className="card">
          <h2>
            <Bell size={20} /> 顾客呼叫
          </h2>
          <div className="grid">
            {tasks.calls.length ? (
              tasks.calls.map((call) => (
                <div className="service-task" key={call.id}>
                  <div>
                    <h3>{call.tableName}</h3>
                    <p className="muted">等待 {call.waitMinutes} 分钟 / {call.status}</p>
                    <p>{call.message ?? '顾客呼叫服务员'}</p>
                  </div>
                  <div className="payment-actions">
                    {call.status === 'open' ? (
                      <button
                        className="button"
                        type="button"
                        disabled={busyId === call.id}
                        onClick={() => patch(`/api/service/calls/${call.id}/acknowledge`, `${call.tableName} 已响应`, call.id)}
                      >
                        已响应
                      </button>
                    ) : null}
                    <button
                      className="primary-button compact"
                      type="button"
                      disabled={busyId === call.id}
                      onClick={() => patch(`/api/service/calls/${call.id}/resolve`, `${call.tableName} 呼叫已处理`, call.id)}
                    >
                      <Check size={16} />
                      已处理
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="muted">暂无顾客呼叫。</p>
            )}
          </div>
        </article>

        <article className="card">
          <h2>
            <Utensils size={20} /> 待上桌
          </h2>
          <div className="grid">
            {tasks.readyItems.length ? (
              tasks.readyItems.map((item) => (
                <div className="service-task" key={item.id}>
                  <div>
                    <h3>{item.tableName}</h3>
                    <strong>
                      {item.name} x {item.quantity}
                    </strong>
                    <p className="muted">订单：{item.orderNo} / 已出餐 {item.waitMinutes} 分钟</p>
                    {item.remark ? <p>备注：{item.remark}</p> : null}
                  </div>
                  <button
                    className="primary-button compact"
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => patch(`/api/service/order-items/${item.id}/served`, `${item.tableName} ${item.name} 已上桌`, item.id)}
                  >
                    <Check size={16} />
                    已上桌
                  </button>
                </div>
              ))
            ) : (
              <p className="muted">暂无待上桌菜品。</p>
            )}
          </div>
        </article>
      </section>
    </main>
  );
}

