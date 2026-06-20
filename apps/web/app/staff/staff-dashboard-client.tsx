'use client';

import { Banknote, Bell, CheckCircle2, Combine, LogIn, RefreshCcw, RotateCcw, Send, Split, Trash2, Utensils } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useRealtimeEvents } from '../use-realtime-events';

type PaymentMethod = 'cash' | 'wechat' | 'alipay';
type AdjustmentType = 'discount' | 'rounding' | 'comp' | 'service_charge';

type StaffPayment = {
  id: string;
  method: PaymentMethod;
  amount: number;
  status: string;
  channel?: 'manual' | 'online';
  merchantTradeNo?: string | null;
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
  subtotalAmount: number;
  discountAmount: number;
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
  options?: MenuOption[];
};

type MenuOptionValue = {
  name: string;
  priceDelta: number;
};

type MenuOption = {
  id: string;
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  values: MenuOptionValue[];
};

type SelectedOption = {
  optionName: string;
  valueName: string;
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
  const [selectedOptionsByOrder, setSelectedOptionsByOrder] = useState<Record<string, Record<string, string[]>>>({});
  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const [adjustmentByOrder, setAdjustmentByOrder] = useState<Record<string, { type: AdjustmentType; amount: number; reason: string }>>({});
  const [reopenReasonByOrder, setReopenReasonByOrder] = useState<Record<string, string>>({});

  const activeMenuItems = menuItems.filter((item) => item.status === 'active');
  const busyTables = useMemo(() => tables.filter((table) => table.orders.length > 0 || table.status !== 'idle').length, [tables]);

  async function refreshTables() {
    const response = await fetch('/api/staff/tables', { cache: 'no-store' });
    if (!response.ok) return;
    setTables(await response.json());
  }

  async function refreshMenuItems() {
    const response = await fetch('/api/public/restaurants/seed-restaurant-xidao/menu', { cache: 'no-store' });
    if (!response.ok) return;
    const categories = await response.json();
    setMenuItems(categories.flatMap((category: { menuItems: MenuItem[] }) => category.menuItems));
  }

  async function refreshDashboard() {
    await Promise.all([refreshTables(), refreshMenuItems()]);
  }

  useRealtimeEvents(['staff.tables.updated', 'menu.updated'], refreshDashboard);

  function getSelectedMenuItem(orderId: string) {
    const menuItemId = itemByOrder[orderId] ?? activeMenuItems[0]?.id;
    return activeMenuItems.find((item) => item.id === menuItemId) ?? null;
  }

  function getSelectedOptions(orderId: string, menuItem: MenuItem): SelectedOption[] {
    const selected = selectedOptionsByOrder[orderId] ?? {};
    return (menuItem.options ?? []).flatMap((option) => (selected[option.name] ?? []).map((valueName) => ({ optionName: option.name, valueName })));
  }

  function validateSelectedOptions(orderId: string, menuItem: MenuItem) {
    const selected = selectedOptionsByOrder[orderId] ?? {};
    for (const option of menuItem.options ?? []) {
      const values = selected[option.name] ?? [];
      if (option.required && values.length === 0) return `请选择${option.name}`;
      if (option.type === 'single' && values.length > 1) return `${option.name}只能选一项`;
    }
    return '';
  }

  function setOptionSelection(orderId: string, option: MenuOption, valueName: string, checked: boolean) {
    setSelectedOptionsByOrder((current) => {
      const orderSelections = current[orderId] ?? {};
      const currentValues = orderSelections[option.name] ?? [];
      const nextValues =
        option.type === 'single'
          ? [valueName]
          : checked
            ? Array.from(new Set([...currentValues, valueName]))
            : currentValues.filter((name) => name !== valueName);

      return {
        ...current,
        [orderId]: {
          ...orderSelections,
          [option.name]: nextValues,
        },
      };
    });
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusyId(label);
    setMessage('');
    try {
      await action();
      setMessage(`${label} 已完成`);
      await refreshDashboard();
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
    const menuItem = getSelectedMenuItem(order.id);
    if (!menuItem) {
      setMessage('没有可加菜品');
      return;
    }

    const optionError = validateSelectedOptions(order.id, menuItem);
    if (optionError) {
      setMessage(optionError);
      return;
    }

    await run(`加菜 ${order.orderNo}`, async () => {
      await request(`/api/staff/orders/${order.id}/items`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ menuItemId: menuItem.id, quantity: 1, remark: '收银台加菜', options: getSelectedOptions(order.id, menuItem) }),
      });
    });
  }

  async function updateMenuItemStatus(item: MenuItem, status: 'active' | 'sold_out') {
    await run(`${item.name} ${status}`, async () => {
      await request(`/api/staff/menu-items/${item.id}/status`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ status }),
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

  async function createPaymentIntent(order: StaffOrder, method: Exclude<PaymentMethod, 'cash'>) {
    const amount = Math.max(0, order.totalAmount - netPaid(order));
    if (amount <= 0) {
      setMessage('订单已无待收金额');
      return;
    }

    await run(`${order.orderNo} ${paymentLabels[method]}支付单`, async () => {
      await request(`/api/staff/orders/${order.id}/payment-intents`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ method, amount }),
      });
    });
  }

  async function markPaymentIntentPaid(payment: StaffPayment) {
    await run(`${payment.method} 支付成功`, async () => {
      await request(`/api/staff/payment-intents/${payment.id}/mark-paid`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ providerTradeNo: `mock-${Date.now()}` }),
      });
    });
  }

  async function closePaymentIntent(payment: StaffPayment) {
    await run(`${payment.method} 关闭支付单`, async () => {
      await request(`/api/staff/payment-intents/${payment.id}/close`, { method: 'POST' });
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

  async function adjustOrder(order: StaffOrder) {
    const form = adjustmentByOrder[order.id] ?? { type: 'discount', amount: 0, reason: '' };
    if (form.amount <= 0 || !form.reason.trim()) {
      setMessage('请输入调整金额和原因');
      return;
    }

    await run(`${order.orderNo} 金额调整`, async () => {
      await request(`/api/staff/orders/${order.id}/adjustments`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ type: form.type, amount: form.amount, reason: form.reason.trim() }),
      });
      setAdjustmentByOrder((current) => ({ ...current, [order.id]: { type: form.type, amount: 0, reason: '' } }));
    });
  }

  async function reopenOrder(order: StaffOrder) {
    const reason = reopenReasonByOrder[order.id]?.trim();
    if (!reason) {
      setMessage('请输入反结账原因');
      return;
    }

    await run(`${order.orderNo} 反结账`, async () => {
      await request(`/api/staff/orders/${order.id}/reopen`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ reason }),
      });
      setReopenReasonByOrder((current) => ({ ...current, [order.id]: '' }));
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
        <button className="button" type="button" onClick={refreshDashboard}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="card menu-status-panel">
        <div className="ticket-header">
          <h2>菜品状态</h2>
          <button className="button" type="button" disabled={Boolean(busyId)} onClick={refreshMenuItems}>
            <RefreshCcw size={16} />
            刷新菜品
          </button>
        </div>
        <div className="menu-status-list">
          {menuItems.map((item) => (
            <div className="menu-status-row" key={item.id}>
              <span>
                <strong>{item.name}</strong>
                <span className="muted"> {formatMoney(item.price)}</span>
              </span>
              <span className={item.status === 'sold_out' ? 'sold-out' : 'pill'}>{item.status === 'sold_out' ? '已沽清' : '可售'}</span>
              <button className="button" type="button" disabled={Boolean(busyId) || item.status === 'sold_out'} onClick={() => updateMenuItemStatus(item, 'sold_out')}>
                沽清
              </button>
              <button className="button" type="button" disabled={Boolean(busyId) || item.status === 'active'} onClick={() => updateMenuItemStatus(item, 'active')}>
                恢复
              </button>
            </div>
          ))}
        </div>
      </section>

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
                  const adjustmentAmount = Math.max(0, order.totalAmount - order.subtotalAmount + order.discountAmount);
                  const adjustmentForm = adjustmentByOrder[order.id] ?? { type: 'discount' as AdjustmentType, amount: 0, reason: '' };
                  const pendingOnlinePayments = order.payments.filter((payment) => payment.channel === 'online' && payment.status === 'pending');

                  return (
                    <div className="order-panel" key={order.id}>
                      <p className="muted">订单：{order.orderNo}</p>
                      <div className="amount-breakdown">
                        <span>小计 <strong>{formatMoney(order.subtotalAmount)}</strong></span>
                        <span>减免 <strong>{formatMoney(order.discountAmount)}</strong></span>
                        <span>调整 <strong>{formatMoney(adjustmentAmount)}</strong></span>
                        <span>应收 <strong>{formatMoney(order.totalAmount)}</strong></span>
                        <span>已收 <strong>{formatMoney(netPaid(order))}</strong></span>
                        <span>待收 <strong>{formatMoney(remaining)}</strong></span>
                      </div>

                      <div className="inline-form compact-form">
                        <select
                          value={itemByOrder[order.id] ?? activeMenuItems[0]?.id ?? ''}
                          onChange={(event) => {
                            setItemByOrder((current) => ({ ...current, [order.id]: event.target.value }));
                            setSelectedOptionsByOrder((current) => ({ ...current, [order.id]: {} }));
                          }}
                        >
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
                      {(() => {
                        const selectedMenuItem = getSelectedMenuItem(order.id);
                        if (!selectedMenuItem?.options?.length) return null;
                        const selected = selectedOptionsByOrder[order.id] ?? {};

                        return (
                          <div className="order-option-panel">
                            {selectedMenuItem.options.map((option) => (
                              <fieldset className="option-group" key={option.id}>
                                <legend>
                                  {option.name}
                                  {option.required ? ' *' : ''}
                                </legend>
                                <div className="chip-list">
                                  {option.values.map((value) => {
                                    const checked = (selected[option.name] ?? []).includes(value.name);
                                    return (
                                      <label className="option-choice" key={value.name}>
                                        <input
                                          type={option.type === 'single' ? 'radio' : 'checkbox'}
                                          name={`${order.id}-${option.id}`}
                                          checked={checked}
                                          onChange={(event) => setOptionSelection(order.id, option, value.name, event.target.checked)}
                                        />
                                        <span>
                                          {value.name}
                                          {value.priceDelta ? ` +${formatMoney(value.priceDelta)}` : ''}
                                        </span>
                                      </label>
                                    );
                                  })}
                                </div>
                              </fieldset>
                            ))}
                          </div>
                        );
                      })()}

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

                      <div className="adjustment-panel">
                        <select
                          value={adjustmentForm.type}
                          onChange={(event) =>
                            setAdjustmentByOrder((current) => ({
                              ...current,
                              [order.id]: { ...adjustmentForm, type: event.target.value as AdjustmentType },
                            }))
                          }
                        >
                          <option value="discount">折扣</option>
                          <option value="rounding">抹零</option>
                          <option value="comp">赠菜/免单</option>
                          <option value="service_charge">服务费</option>
                        </select>
                        <input
                          type="number"
                          min={0}
                          value={adjustmentForm.amount || ''}
                          placeholder="金额(分)"
                          onChange={(event) =>
                            setAdjustmentByOrder((current) => ({
                              ...current,
                              [order.id]: { ...adjustmentForm, amount: Number(event.target.value) },
                            }))
                          }
                        />
                        <input
                          value={adjustmentForm.reason}
                          placeholder="原因"
                          onChange={(event) =>
                            setAdjustmentByOrder((current) => ({
                              ...current,
                              [order.id]: { ...adjustmentForm, reason: event.target.value },
                            }))
                          }
                        />
                        <button className="button" type="button" disabled={Boolean(busyId) || order.paymentStatus === 'paid'} onClick={() => adjustOrder(order)}>
                          调整
                        </button>
                      </div>

                      {order.paymentStatus === 'paid' ? (
                        <div className="reopen-panel">
                          <input
                            value={reopenReasonByOrder[order.id] ?? ''}
                            placeholder="反结账原因"
                            onChange={(event) => setReopenReasonByOrder((current) => ({ ...current, [order.id]: event.target.value }))}
                          />
                          <button className="button danger-button" type="button" disabled={Boolean(busyId)} onClick={() => reopenOrder(order)}>
                            反结账
                          </button>
                        </div>
                      ) : null}

                      <div className="payment-actions">
                        <button className="button" type="button" disabled={Boolean(busyId) || remaining <= 0} onClick={() => createPaymentIntent(order, 'wechat')}>
                          微信支付单
                        </button>
                        <button className="button" type="button" disabled={Boolean(busyId) || remaining <= 0} onClick={() => createPaymentIntent(order, 'alipay')}>
                          支付宝支付单
                        </button>
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

                      {pendingOnlinePayments.length ? (
                        <div className="payment-intent-list">
                          {pendingOnlinePayments.map((payment) => (
                            <div className="ticket-item" key={payment.id}>
                              <span>
                                {payment.method} {formatMoney(payment.amount)}
                                <span className="muted"> {payment.merchantTradeNo ?? ''}</span>
                              </span>
                              <button className="button" type="button" disabled={Boolean(busyId)} onClick={() => markPaymentIntentPaid(payment)}>
                                模拟成功
                              </button>
                              <button className="button danger-button" type="button" disabled={Boolean(busyId)} onClick={() => closePaymentIntent(payment)}>
                                关闭
                              </button>
                            </div>
                          ))}
                        </div>
                      ) : null}
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
