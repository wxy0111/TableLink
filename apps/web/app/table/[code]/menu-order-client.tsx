'use client';

import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  status: 'active' | 'inactive' | 'sold_out';
};

type Category = {
  id: string;
  name: string;
  menuItems: MenuItem[];
};

type CartItem = {
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
};

type OrderResult = {
  id: string;
  orderNo: string;
  totalAmount: number;
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

export function MenuOrderClient({
  tableCode,
  categories,
}: {
  tableCode: string;
  categories: Category[];
}) {
  const [cart, setCart] = useState<CartItem[]>([]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callingService, setCallingService] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState('');
  const [serviceCallMessage, setServiceCallMessage] = useState('');

  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const totalQuantity = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  function addItem(menuItem: MenuItem) {
    if (menuItem.status !== 'active') return;
    setOrder(null);
    setError('');
    setCart((current) => {
      const existing = current.find((item) => item.menuItemId === menuItem.id);
      if (existing) {
        return current.map((item) =>
          item.menuItemId === menuItem.id ? { ...item, quantity: item.quantity + 1 } : item,
        );
      }

      return [
        ...current,
        {
          menuItemId: menuItem.id,
          name: menuItem.name,
          price: menuItem.price,
          quantity: 1,
        },
      ];
    });
  }

  function updateQuantity(menuItemId: string, quantity: number) {
    setCart((current) =>
      current
        .map((item) => (item.menuItemId === menuItemId ? { ...item, quantity } : item))
        .filter((item) => item.quantity > 0),
    );
  }

  async function submitOrder() {
    if (!cart.length || submitting) return;

    setSubmitting(true);
    setError('');

    try {
      const response = await fetch('/api/public/orders', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          tableCode,
          remark,
          items: cart.map((item) => ({
            menuItemId: item.menuItemId,
            quantity: item.quantity,
            remark: '',
            options: [],
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '下单失败');
      }

      const createdOrder = (await response.json()) as OrderResult;
      setOrder(createdOrder);
      setCart([]);
      setRemark('');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '下单失败');
    } finally {
      setSubmitting(false);
    }
  }

  async function callService() {
    if (callingService) return;
    setCallingService(true);
    setServiceCallMessage('');
    setError('');

    try {
      const response = await fetch(`/api/public/tables/${tableCode}/service-calls`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ message: '顾客呼叫服务员' }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '呼叫失败');
      }

      setServiceCallMessage('已呼叫服务员，请稍候。');
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : '呼叫失败');
    } finally {
      setCallingService(false);
    }
  }

  return (
    <div className="order-layout">
      <section className="grid menu-sections">
        {categories.map((category) => (
          <div className="menu-section" key={category.id}>
            <h2>{category.name}</h2>
            <div className="grid menu-grid">
              {category.menuItems.map((item) => (
                <article className="menu-item" key={item.id}>
                  <div>
                    <div className="menu-item-title">
                      <strong>{item.name}</strong>
                      {item.status === 'sold_out' ? <span className="sold-out">售罄</span> : null}
                    </div>
                    <p className="muted">{item.description || '经典川味，现点现做'}</p>
                  </div>
                  <div className="menu-item-actions">
                    <span>{formatMoney(item.price)}</span>
                    <button
                      className="icon-button"
                      type="button"
                      disabled={item.status !== 'active'}
                      aria-label={`添加${item.name}`}
                      title={`添加${item.name}`}
                      onClick={() => addItem(item)}
                    >
                      <Plus size={18} />
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ))}
      </section>

      <aside className="cart-panel" aria-label="购物车">
        <div className="cart-title">
          <ShoppingCart size={20} />
          <strong>购物车</strong>
          <span className="muted">{totalQuantity} 份</span>
        </div>

        {cart.length ? (
          <div className="cart-items">
            {cart.map((item) => (
              <div className="cart-item" key={item.menuItemId}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{formatMoney(item.price)}</p>
                </div>
                <div className="quantity-controls">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`减少${item.name}`}
                    title={`减少${item.name}`}
                    onClick={() => updateQuantity(item.menuItemId, item.quantity - 1)}
                  >
                    {item.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`增加${item.name}`}
                    title={`增加${item.name}`}
                    onClick={() => updateQuantity(item.menuItemId, item.quantity + 1)}
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="muted">还没有选择菜品。</p>
        )}

        <textarea
          className="remark-input"
          placeholder="整单备注"
          value={remark}
          onChange={(event) => setRemark(event.target.value)}
        />

        <div className="cart-total">
          <span>合计</span>
          <strong>{formatMoney(totalAmount)}</strong>
        </div>

        {error ? <p className="error-text">{error}</p> : null}
        {serviceCallMessage ? <div className="notice-box">{serviceCallMessage}</div> : null}
        {order ? (
          <div className="success-box">
            <strong>下单成功</strong>
            <p>订单号：{order.orderNo}</p>
            <p>厨房已收到订单。</p>
          </div>
        ) : null}

        <button className="primary-button" type="button" disabled={!cart.length || submitting} onClick={submitOrder}>
          {submitting ? '提交中...' : '提交订单'}
        </button>
        <button className="secondary-button" type="button" disabled={callingService} onClick={callService}>
          {callingService ? '呼叫中...' : '呼叫服务员'}
        </button>
      </aside>
    </div>
  );
}
