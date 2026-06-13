'use client';

import { Banknote, Bell, CheckCircle2, Combine, LogIn, RefreshCcw, RotateCcw, Send, Split, Trash2, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';

type PaymentMethod = 'cash' | 'wechat' | 'alipay';

type StaffPayment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: string;
};

type StaffOrderItem = {
  id: string;
  nameSnapshot: string;
  priceSnapshot: number;
  quantity: number;
  status: string;
};

type StaffOrder = {
  id: string;
  orderNo: string;
  totalAmount: number;
  paymentStatus: string;
  items: StaffOrderItem[];
  payments: StaffPayment[];
};

type StaffTable = {
  id: string;
  code: string;
  name: string;
  status: string;
  orders: StaffOrder[];
};

type MenuItem = {
  id: string;
  name: string;
  price: number;
  status: string;
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
};

function netPaid(order: StaffOrder) {
  const paid = order.payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = order.payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
  return paid - refunded;
}

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? '操作失败');
  }
  return body;
}

export function StaffDashboardClient({ initialTables, initialMenuItems }: { initialTables: StaffTable[]; initialMenuItems: MenuItem[] }) {
  const [tables, setTables] = useState(initialTables);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [targetByTable, setTargetByTable] = useState<Record<string, string>>({});
  const [itemByOrder, setItemByOrder] = useState<Record<string, string>>({});

  const activeMenuItems = initialMenuItems.filter((item) => item.status === 'active');
  const busyTables = useMemo(() => tables.filter((table) => table.orders.length > 0 || table.status !== 'idle').length, [tables]);

  async function refreshTables() {
    const response = await fetch('/api/staff/tables', { cache: 'no-store' });
    if (!response.ok) return;
    setTables(await response.json());
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusyId(label);
    setMessage('');
    try {
      await action();
      setMessage(`${label} 已完成`);
      await refreshTables();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  async function openTable(table: StaffTable) {
    await run(`开台 ${table.name}`, async () => {
      await request(`/api/staff/tables/${table.id}/open`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ note: '收银台开台' }),
      });
    });
  }

  async function clearTable(table: StaffTable) {
    await run(`清台 ${table.name}`, async () => {
      await request(`/api/staff/tables/${table.id}/clear`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ reason: '收银台清台' }),
      });
    });
  }

  async function moveTable(table: StaffTable) {
    const targetTableId = targetByTable[table.id];
    if (!targetTableId) {
      setMessage('请选择目标桌台');
      return;
    }

    await run(`换桌 ${table.name}`, async () => {
      await request(`/api/staff/tables/${table.id}/move`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ targetTableId, reason: '收银台换桌' }),
      });
    });
  }

  async function mergeTable(table: StaffTable) {
    const targetTableId = targetByTable[table.id];
    if (!targetTableId) {
      setMessage('请选择目标桌台');
      return;
    }

    await run(`并桌 ${table.name}`, async () => {
      await request('/api/staff/tables/merge', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ sourceTableId: table.id, targetTableId, reason: '收银台并桌' }),
      });
    });
  }

  async function addItem(order: StaffOrder) {
    const menuItemId = itemByOrder[order.id] ?? activeMenuItems[0]?.id;
    if (!menuItemId) {
      setMessage('没有可加菜品');
      return;
    }

    await run(`加菜 ${order.orderNo}`, async () => {
      await request(`/api/staff/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ menuItemId, quantity: 1, remark: '收银台加菜', options: [] }),
      });
    });
  }

  async function itemAction(order: StaffOrder, item: StaffOrderItem, action: 'refund' | 'urge' | 'hold' | 'resume') {
    const actionPath = action === 'refund' ? 'refund' : action === 'urge' ? 'urge' : 'hold';
    const body = action === 'hold' ? { hold: true, reason: '收银台等叫' } : action === 'resume' ? { hold: false, reason: '收银台恢复制作' } : { reason: '收银台操作' };

    await run(`${item.nameSnapshot} ${action}`, async () => {
      await request(`/api/staff/orders/${order.id}/items/${item.id}/${actionPath}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(body),
      });
    });
  }

  async function pay(order: StaffOrder, method: PaymentMethod) {
    const amount = Math.max(0, order.totalAmount - netPaid(order));
    if (amount <= 0) {
      setMessage('订单已无待收金额');
      return;
    }

    await run(`${order.orderNo} ${paymentLabels[method]}收款`, async () => {
      await request(`/api/staff/orders/${order.id}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ method, amount, note: `收银台${paymentLabels[method]}收款` }),
      });
    });
  }

  async function refundPayment(order: StaffOrder) {
    const amount = Math.min(100, Math.max(0, netPaid(order)));
    if (amount <= 0) {
      setMessage('订单暂无可退金额');
      return;
    }

    await run(`${order.orderNo} 退款`, async () => {
      await request(`/api/staff/orders/${order.id}/refunds`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ method: 'cash', amount, reason: '收银台退款' }),
      });
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">收银台</div>
          <p className="muted">
            营业桌台 {busyTables} 张，总桌台 {tables.length} 张
          </p>
        </div>
        <button className="button" type="button" onClick={refreshTables}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="grid menu-grid">
        {tables.map((table) => {
          const targetOptions = tables.filter((candidate) => candidate.id !== table.id);

          return (
            <article className={`table-card ${table.orders.length ? 'table-card-busy' : ''}`} key={table.id}>
              <div className="ticket-header">
                <h2>{table.name}</h2>
                <span className="pill">{table.status}</span>
              </div>
              <p>当前未结订单：{table.orders.length}</p>

              <div className="payment-actions">
                <button className="button" type="button" disabled={Boolean(busyId) || table.orders.length > 0} onClick={() => openTable(table)}>
                  <LogIn size={16} />
                  开台
                </button>
                <button className="button" type="button" disabled={Boolean(busyId)} onClick={() => clearTable(table)}>
                  <CheckCircle2 size={16} />
                  清台
                </button>
              </div>

              <div className="inline-form compact-form">
                <select value={targetByTable[table.id] ?? ''} onChange={(event) => setTargetByTable((current) => ({ ...current, [table.id]: event.target.value }))}>
                  <option value="">目标桌台</option>
                  {targetOptions.map((candidate) => (
                    <option value={candidate.id} key={candidate.id}>
                      {candidate.name}
                    </option>
                  ))}
                </select>
                <button className="icon-button" type="button" disabled={Boolean(busyId) || table.orders.length === 0} onClick={() => moveTable(table)} title="换桌">
                  <Send size={16} />
                </button>
                <button className="icon-button" type="button" disabled={Boolean(busyId) || table.orders.length === 0} onClick={() => mergeTable(table)} title="并桌">
                  <Combine size={16} />
                </button>
              </div>

              {table.orders.length === 0 ? (
                <p className="muted">
                  <CheckCircle2 size={16} /> 空闲可接待
                </p>
              ) : (
                table.orders.map((order) => {
                  const remaining = Math.max(0, order.totalAmount - netPaid(order));

                  return (
                    <div className="order-panel" key={order.id}>
                      <p className="muted">订单：{order.orderNo}</p>
                      <p>
                        <strong>{formatMoney(order.totalAmount)}</strong>
                        <span className="muted"> 待收 {formatMoney(remaining)}</span>
                      </p>

                      <div className="inline-form compact-form">
                        <select value={itemByOrder[order.id] ?? activeMenuItems[0]?.id ?? ''} onChange={(event) => setItemByOrder((current) => ({ ...current, [order.id]: event.target.value }))}>
                          {activeMenuItems.map((item) => (
                            <option value={item.id} key={item.id}>
                              {item.name} {formatMoney(item.price)}
                            </option>
                          ))}
                        </select>
                        <button className="button" type="button" disabled={Boolean(busyId)} onClick={() => addItem(order)}>
                          <Utensils size={16} />
                          加菜
                        </button>
                      </div>

                      <div className="item-list">
                        {order.items.map((item) => (
                          <div className="item-row" key={item.id}>
                            <span>
                              {item.nameSnapshot} x {item.quantity}
                            </span>
                            <span className="pill">{item.status}</span>
                            <button className="icon-button" type="button" disabled={Boolean(busyId)} onClick={() => itemAction(order, item, 'urge')} title="催菜">
                              <Bell size={16} />
                            </button>
                            <button className="icon-button" type="button" disabled={Boolean(busyId) || item.status === 'held'} onClick={() => itemAction(order, item, 'hold')} title="等叫">
                              <Split size={16} />
                            </button>
                            <button className="icon-button" type="button" disabled={Boolean(busyId) || item.status !== 'held'} onClick={() => itemAction(order, item, 'resume')} title="恢复制作">
                              <RotateCcw size={16} />
                            </button>
                            <button className="icon-button danger-button" type="button" disabled={Boolean(busyId)} onClick={() => itemAction(order, item, 'refund')} title="退菜">
                              <Trash2 size={16} />
                            </button>
                          </div>
                        ))}
                      </div>

                      <div className="payment-actions">
                        <button className="button" type="button" disabled={Boolean(busyId) || remaining <= 0} onClick={() => pay(order, 'wechat')}>
                          微信
                        </button>
                        <button className="button" type="button" disabled={Boolean(busyId) || remaining <= 0} onClick={() => pay(order, 'alipay')}>
                          支付宝
                        </button>
                        <button className="button" type="button" disabled={Boolean(busyId) || remaining <= 0} onClick={() => pay(order, 'cash')}>
                          <Banknote size={16} />
                          现金
                        </button>
                        <button className="button danger-button" type="button" disabled={Boolean(busyId) || netPaid(order) <= 0} onClick={() => refundPayment(order)}>
                          退款
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}
