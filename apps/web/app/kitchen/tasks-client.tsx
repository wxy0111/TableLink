'use client';

import { Check, Flame, Play, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

type KitchenTask = {
  id: string;
  orderNo: string;
  tableName: string;
  name: string;
  quantity: number;
  remark: string | null;
  status: 'submitted' | 'accepted' | 'cooking';
  ageMinutes: number;
  urgency: 'green' | 'yellow' | 'orange' | 'red';
  priorityScore: number;
  isLastUnreadyItem: boolean;
  hasActiveServiceCall: boolean;
};

const urgencyLabels = {
  green: '5分钟内',
  yellow: '5-10分钟',
  orange: '10-20分钟',
  red: '20分钟以上',
};

export function KitchenTasksClient({ initialTasks }: { initialTasks: KitchenTask[] }) {
  const [tasks, setTasks] = useState(initialTasks);
  const [busyItemId, setBusyItemId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const itemCount = useMemo(() => tasks.reduce((sum, task) => sum + task.quantity, 0), [tasks]);

  async function refreshTasks() {
    const response = await fetch('/api/kitchen/orders/tasks', { cache: 'no-store' });
    if (!response.ok) return;
    setTasks(await response.json());
  }

  async function updateItem(task: KitchenTask, action: 'start' | 'ready') {
    setBusyItemId(task.id);
    setMessage('');

    try {
      const response = await fetch(`/api/kitchen/orders/order-items/${task.id}/${action}`, {
        method: 'PATCH',
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '操作失败');
      }

      setMessage(action === 'start' ? `${task.tableName} ${task.name} 已开始制作` : `${task.tableName} ${task.name} 已出餐`);
      await refreshTasks();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusyItemId(null);
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">厨房屏</div>
          <p className="muted">
            待处理菜品 {tasks.length} 项，共 {itemCount} 份，按优先级排序
          </p>
        </div>
        <button className="button" type="button" onClick={refreshTasks}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="task-list">
        {tasks.length ? (
          tasks.map((task, index) => (
            <article className={`kitchen-task urgency-${task.urgency}`} key={task.id}>
              <div className="task-rank">#{index + 1}</div>
              <div className="task-main">
                <div className="ticket-header">
                  <h2>{task.tableName}</h2>
                  <span className="pill">{urgencyLabels[task.urgency]}</span>
                </div>
                <strong className="task-name">
                  {task.name} x {task.quantity}
                </strong>
                <p className="muted">订单：{task.orderNo}</p>
                {task.remark ? <p>备注：{task.remark}</p> : null}
                <div className="task-flags">
                  <span>等待 {task.ageMinutes} 分钟</span>
                  <span>优先级 {task.priorityScore}</span>
                  {task.isLastUnreadyItem ? <span className="hot-flag">本桌最后一道</span> : null}
                  {task.hasActiveServiceCall ? <span className="hot-flag">该桌已呼叫</span> : null}
                </div>
              </div>
              <div className="task-actions">
                {task.status === 'cooking' ? (
                  <button className="primary-button" type="button" disabled={busyItemId === task.id} onClick={() => updateItem(task, 'ready')}>
                    <Check size={18} />
                    出餐确认
                  </button>
                ) : (
                  <button className="button" type="button" disabled={busyItemId === task.id} onClick={() => updateItem(task, 'start')}>
                    <Play size={18} />
                    开始制作
                  </button>
                )}
                <span className="muted">
                  <Flame size={16} /> {task.status}
                </span>
              </div>
            </article>
          ))
        ) : (
          <div className="empty-state">暂无厨房任务。</div>
        )}
      </section>
    </main>
  );
}

