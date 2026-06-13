'use client';

import { Banknote, CheckCircle2, QrCode, RefreshCcw } from 'lucide-react';
import { useMemo, useState } from 'react';

type PaymentMethod = 'cash' | 'wechat' | 'alipay';

type StaffOrder = {
  id: string;
  orderNo: string;
  totalAmount: number;
  paymentStatus: string;
};

type StaffTable = {
  id: string;
  name: string;
  status: string;
  orders: StaffOrder[];
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

const paymentLabels: Record<PaymentMethod, string> = {
  cash: '现金',
  wechat: '微信',
  alipay: '支付宝',
};

export function StaffDashboardClient({ initialTables }: { initialTables: StaffTable[] }) {
  const [tables, setTables] = useState(initialTables);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const busyTables = useMemo(
    () => tables.filter((table) => table.orders.length > 0 || table.status !== 'idle').length,
    [tables],
  );

  async function refreshTables() {
    const response = await fetch('/api/staff/tables', { cache: 'no-store' });
    if (!response.ok) return;
    setTables(await response.json());
  }

  async function markPaid(order: StaffOrder, method: PaymentMethod) {
    setPayingOrderId(order.id);
    setMessage('');

    try {
      const response = await fetch(`/api/staff/orders/${order.id}/payments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          method,
          amount: order.totalAmount,
          note: `收银台${paymentLabels[method]}收款`,
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '收款失败');
      }

      setMessage(`${order.orderNo} 已记录${paymentLabels[method]}收款`);
      await refreshTables();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '收款失败');
    } finally {
      setPayingOrderId(null);
    }
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
          const order = table.orders[0];

          return (
            <article className={`table-card ${order ? 'table-card-busy' : ''}`} key={table.id}>
              <div className="ticket-header">
                <h2>{table.name}</h2>
                <span className="pill">{table.status}</span>
              </div>
              <p>当前未结订单：{table.orders.length}</p>
              {order ? (
                <>
                  <p className="muted">最近订单：{order.orderNo}</p>
                  <p>
                    <strong>{formatMoney(order.totalAmount)}</strong>
                  </p>
                  <div className="payment-actions">
                    <button
                      className="button"
                      type="button"
                      disabled={payingOrderId === order.id}
                      onClick={() => markPaid(order, 'wechat')}
                    >
                      <QrCode size={16} />
                      微信
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={payingOrderId === order.id}
                      onClick={() => markPaid(order, 'alipay')}
                    >
                      <QrCode size={16} />
                      支付宝
                    </button>
                    <button
                      className="button"
                      type="button"
                      disabled={payingOrderId === order.id}
                      onClick={() => markPaid(order, 'cash')}
                    >
                      <Banknote size={16} />
                      现金
                    </button>
                  </div>
                </>
              ) : (
                <p className="muted">
                  <CheckCircle2 size={16} /> 空闲可接待
                </p>
              )}
            </article>
          );
        })}
      </section>
    </main>
  );
}

