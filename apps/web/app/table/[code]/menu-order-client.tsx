'use client';

import { Minus, Plus, ShoppingCart, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';

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
  sortOrder: number;
};

type MenuItem = {
  id: string;
  name: string;
  description: string | null;
  price: number;
  status: 'active' | 'inactive' | 'sold_out';
  options?: MenuOption[];
};

type Category = {
  id: string;
  name: string;
  menuItems: MenuItem[];
};

type SelectedOption = {
  optionName: string;
  valueName: string;
};

type CartItem = {
  key: string;
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  options: SelectedOption[];
};

type OrderResult = {
  id: string;
  orderNo: string;
  totalAmount: number;
  customerAccessToken: string;
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

function buildCartKey(menuItemId: string, options: SelectedOption[]) {
  return `${menuItemId}:${options.map((option) => `${option.optionName}=${option.valueName}`).sort().join('|')}`;
}

export function MenuOrderClient({
  tableCode,
  restaurantId,
  categories,
}: {
  tableCode: string;
  restaurantId: string;
  categories: Category[];
}) {
  const [menuCategories, setMenuCategories] = useState(categories);
  const [cart, setCart] = useState<CartItem[]>([]);
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [callingService, setCallingService] = useState(false);
  const [order, setOrder] = useState<OrderResult | null>(null);
  const [error, setError] = useState('');
  const [serviceCallMessage, setServiceCallMessage] = useState('');
  const [selectedOptionsByItem, setSelectedOptionsByItem] = useState<Record<string, Record<string, string[]>>>({});

  const totalAmount = useMemo(() => cart.reduce((sum, item) => sum + item.price * item.quantity, 0), [cart]);
  const totalQuantity = useMemo(() => cart.reduce((sum, item) => sum + item.quantity, 0), [cart]);

  async function refreshMenu() {
    const response = await fetch(`/api/public/restaurants/${restaurantId}/menu`, { cache: 'no-store' });
    if (!response.ok) return;
    setMenuCategories(await response.json());
  }

  function getSelectedOptions(menuItem: MenuItem) {
    const selected = selectedOptionsByItem[menuItem.id] ?? {};
    return (menuItem.options ?? []).flatMap((option) =>
      (selected[option.name] ?? []).map((valueName) => ({ optionName: option.name, valueName })),
    );
  }

  function getOptionPriceDelta(menuItem: MenuItem) {
    const selected = selectedOptionsByItem[menuItem.id] ?? {};
    return (menuItem.options ?? []).reduce((sum, option) => {
      const selectedValues = new Set(selected[option.name] ?? []);
      return sum + option.values.filter((value) => selectedValues.has(value.name)).reduce((optionSum, value) => optionSum + value.priceDelta, 0);
    }, 0);
  }

  function validateSelectedOptions(menuItem: MenuItem) {
    const selected = selectedOptionsByItem[menuItem.id] ?? {};
    for (const option of menuItem.options ?? []) {
      const values = selected[option.name] ?? [];
      if (option.required && values.length === 0) return `请选择${option.name}`;
      if (option.type === 'single' && values.length > 1) return `${option.name}只能选一项`;
    }
    return '';
  }

  function setOptionSelection(menuItem: MenuItem, option: MenuOption, valueName: string, checked: boolean) {
    setSelectedOptionsByItem((current) => {
      const itemSelections = current[menuItem.id] ?? {};
      const currentValues = itemSelections[option.name] ?? [];
      const nextValues =
        option.type === 'single'
          ? [valueName]
          : checked
            ? Array.from(new Set([...currentValues, valueName]))
            : currentValues.filter((name) => name !== valueName);

      return {
        ...current,
        [menuItem.id]: {
          ...itemSelections,
          [option.name]: nextValues,
        },
      };
    });
  }

  function addItem(menuItem: MenuItem) {
    if (menuItem.status !== 'active') return;
    const optionError = validateSelectedOptions(menuItem);
    if (optionError) {
      setError(optionError);
      return;
    }

    const options = getSelectedOptions(menuItem);
    const key = buildCartKey(menuItem.id, options);
    const price = menuItem.price + getOptionPriceDelta(menuItem);
    setOrder(null);
    setError('');
    setCart((current) => {
      const existing = current.find((item) => item.key === key);
      if (existing) {
        return current.map((item) => (item.key === key ? { ...item, quantity: item.quantity + 1 } : item));
      }

      return [
        ...current,
        {
          key,
          menuItemId: menuItem.id,
          name: menuItem.name,
          price,
          quantity: 1,
          options,
        },
      ];
    });
  }

  function updateQuantity(cartKey: string, quantity: number) {
    setCart((current) => current.map((item) => (item.key === cartKey ? { ...item, quantity } : item)).filter((item) => item.quantity > 0));
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
            options: item.options,
          })),
        }),
      });

      if (!response.ok) {
        const body = await response.json().catch(() => null);
        await refreshMenu();
        throw new Error(body?.message ?? '菜品或规格状态已变化，请重新选择后下单');
      }

      const createdOrder = (await response.json()) as OrderResult;
      window.localStorage.setItem(`tablelink:order:${createdOrder.id}:token`, createdOrder.customerAccessToken);
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
        {menuCategories.map((category) => (
          <div className="menu-section" key={category.id}>
            <h2>{category.name}</h2>
            <div className="grid menu-grid">
              {category.menuItems
                .filter((item) => item.status !== 'inactive')
                .map((item) => {
                  const selected = selectedOptionsByItem[item.id] ?? {};
                  const displayPrice = item.price + getOptionPriceDelta(item);

                  return (
                    <article className="menu-item" key={item.id}>
                      <div>
                        <div className="menu-item-title">
                          <strong>{item.name}</strong>
                          {item.status === 'sold_out' ? <span className="sold-out">已沽清</span> : null}
                        </div>
                        <p className="muted">{item.description || '经典口味，现点现做'}</p>
                      </div>

                      {(item.options ?? []).map((option) => (
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
                                    name={`${item.id}-${option.id}`}
                                    checked={checked}
                                    disabled={item.status !== 'active'}
                                    onChange={(event) => setOptionSelection(item, option, value.name, event.target.checked)}
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

                      <div className="menu-item-actions">
                        <span>{formatMoney(displayPrice)}</span>
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
                  );
                })}
            </div>
          </div>
        ))}
      </section>

      <aside className="cart-panel" aria-label="购物车">
        <div className="cart-title">
          <ShoppingCart size={20} />
          <strong>购物车</strong>
          <span className="muted">{totalQuantity} 件</span>
        </div>

        {cart.length ? (
          <div className="cart-items">
            {cart.map((item) => (
              <div className="cart-item" key={item.key}>
                <div>
                  <strong>{item.name}</strong>
                  <p className="muted">{formatMoney(item.price)}</p>
                  {item.options.length ? <p className="muted">{item.options.map((option) => `${option.optionName}: ${option.valueName}`).join(' / ')}</p> : null}
                </div>
                <div className="quantity-controls">
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`减少${item.name}`}
                    title={`减少${item.name}`}
                    onClick={() => updateQuantity(item.key, item.quantity - 1)}
                  >
                    {item.quantity === 1 ? <Trash2 size={16} /> : <Minus size={16} />}
                  </button>
                  <span>{item.quantity}</span>
                  <button
                    className="icon-button"
                    type="button"
                    aria-label={`增加${item.name}`}
                    title={`增加${item.name}`}
                    onClick={() => updateQuantity(item.key, item.quantity + 1)}
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

        <textarea className="remark-input" placeholder="整单备注" value={remark} onChange={(event) => setRemark(event.target.value)} />

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
