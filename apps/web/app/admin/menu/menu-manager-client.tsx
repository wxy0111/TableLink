'use client';

import { Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';
import { useRealtimeEvents } from '../../use-realtime-events';

type Category = { id: string; name: string; sortOrder: number; isActive: boolean };
type MenuItem = {
  id: string;
  categoryId: string;
  name: string;
  description: string | null;
  price: number;
  imageUrl: string | null;
  kitchenStation: string;
  status: string;
  category?: { name: string };
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
  sortOrder: number;
};

type OptionForm = {
  name: string;
  type: 'single' | 'multiple';
  required: boolean;
  valuesText: string;
  sortOrder: number;
};

const stations = ['hot', 'cold', 'drink', 'staple', 'other'];
const statuses = ['active', 'inactive', 'sold_out'];

export function MenuManagerClient({
  initialCategories,
  initialMenuItems,
}: {
  initialCategories: Category[];
  initialMenuItems: MenuItem[];
}) {
  const [categories, setCategories] = useState(initialCategories);
  const [menuItems, setMenuItems] = useState(initialMenuItems);
  const [categoryName, setCategoryName] = useState('');
  const [message, setMessage] = useState('');
  const [optionForms, setOptionForms] = useState<Record<string, OptionForm>>({});
  const [form, setForm] = useState({
    categoryId: initialCategories[0]?.id ?? '',
    name: '',
    description: '',
    price: 2800,
    kitchenStation: 'hot',
    status: 'active',
    imageUrl: '',
  });

  async function refresh() {
    const [categoryResponse, itemResponse] = await Promise.all([
      fetch('/api/admin/categories', { cache: 'no-store' }),
      fetch('/api/admin/menu-items', { cache: 'no-store' }),
    ]);
    if (categoryResponse.ok) setCategories(await categoryResponse.json());
    if (itemResponse.ok) setMenuItems(await itemResponse.json());
  }

  useRealtimeEvents(['menu.updated'], refresh);

  async function createCategory() {
    if (!categoryName.trim()) return;
    const response = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ name: categoryName, sortOrder: categories.length + 1 }),
    });
    if (response.ok) {
      setCategoryName('');
      setMessage('分类已创建');
      await refresh();
    }
  }

  async function uploadImage(file: File) {
    const body = new FormData();
    body.append('file', file);
    const response = await fetch('/api/admin/menu-images', { method: 'POST', body });
    if (!response.ok) {
      setMessage('图片上传失败');
      return;
    }
    const result = await response.json();
    setForm((current) => ({ ...current, imageUrl: result.imageUrl }));
    setMessage('图片已上传');
  }

  async function createMenuItem(event: FormEvent) {
    event.preventDefault();
    const response = await fetch('/api/admin/menu-items', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify(form),
    });
    if (!response.ok) {
      setMessage('菜品保存失败');
      return;
    }
    setMessage('菜品已保存');
    setForm((current) => ({ ...current, name: '', description: '', imageUrl: '' }));
    await refresh();
  }

  async function updateMenuItemStatus(item: MenuItem, status: string) {
    const response = await fetch(`/api/admin/menu-items/${item.id}/status`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ status }),
    });
    if (response.ok) {
      setMessage(status === 'sold_out' ? '菜品已沽清' : '菜品状态已更新');
      await refresh();
    } else {
      setMessage('菜品状态更新失败');
    }
  }

  function getOptionForm(menuItemId: string) {
    return (
      optionForms[menuItemId] ?? {
        name: '',
        type: 'single',
        required: false,
        valuesText: '[{"name":"默认","priceDelta":0}]',
        sortOrder: 0,
      }
    );
  }

  function parseValues(valuesText: string) {
    const values = JSON.parse(valuesText) as MenuOptionValue[];
    if (!Array.isArray(values)) throw new Error('values must be an array');
    return values;
  }

  async function createOption(item: MenuItem) {
    const optionForm = getOptionForm(item.id);
    try {
      const response = await fetch(`/api/admin/menu-items/${item.id}/options`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          name: optionForm.name,
          type: optionForm.type,
          required: optionForm.required,
          values: parseValues(optionForm.valuesText),
          sortOrder: optionForm.sortOrder,
        }),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '规格保存失败');
      }
      setMessage('规格已保存');
      setOptionForms((current) => ({ ...current, [item.id]: { ...getOptionForm(item.id), name: '' } }));
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '规格保存失败');
    }
  }

  async function editOption(option: MenuOption) {
    const nextValue = window.prompt(
      '编辑规格 JSON',
      JSON.stringify(
        {
          name: option.name,
          type: option.type,
          required: option.required,
          values: option.values,
          sortOrder: option.sortOrder,
        },
        null,
        2,
      ),
    );
    if (!nextValue) return;

    try {
      const payload = JSON.parse(nextValue);
      const response = await fetch(`/api/admin/menu-item-options/${option.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(payload),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.message ?? '规格更新失败');
      }
      setMessage('规格已更新');
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '规格更新失败');
    }
  }

  async function deleteOption(option: MenuOption) {
    const response = await fetch(`/api/admin/menu-item-options/${option.id}`, { method: 'DELETE' });
    if (response.ok) {
      setMessage('规格已删除');
      await refresh();
    } else {
      const body = await response.json().catch(() => null);
      setMessage(body?.message ?? '规格删除失败');
    }
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">菜品管理</div>
          <p className="muted">老板可在这里维护分类、菜名、价格、图片和上下架。</p>
        </div>
        <nav className="nav">
          <a href="/admin">报表</a>
          <a href="/admin/tables">桌台二维码</a>
          <a href="/admin/backups">备份恢复</a>
        </nav>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="admin-grid">
        <article className="card">
          <h2>新增分类</h2>
          <div className="inline-form">
            <input placeholder="分类名" value={categoryName} onChange={(event) => setCategoryName(event.target.value)} />
            <button className="button" type="button" onClick={createCategory}>
              添加
            </button>
          </div>
          <div className="chip-list">
            {categories.map((category) => (
              <span className="pill" key={category.id}>
                {category.name}
              </span>
            ))}
          </div>
        </article>

        <form className="card form-panel" onSubmit={createMenuItem}>
          <h2>新增菜品</h2>
          <label>
            分类
            <select value={form.categoryId} onChange={(event) => setForm({ ...form, categoryId: event.target.value })}>
              {categories.map((category) => (
                <option value={category.id} key={category.id}>
                  {category.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            菜名
            <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
          </label>
          <label>
            描述
            <textarea value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} />
          </label>
          <label>
            价格（分）
            <input type="number" min={0} value={form.price} onChange={(event) => setForm({ ...form, price: Number(event.target.value) })} />
          </label>
          <label>
            档口
            <select value={form.kitchenStation} onChange={(event) => setForm({ ...form, kitchenStation: event.target.value })}>
              {stations.map((station) => (
                <option value={station} key={station}>
                  {station}
                </option>
              ))}
            </select>
          </label>
          <label>
            状态
            <select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value })}>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            图片
            <span className="file-button">
              <Upload size={16} />
              上传图片
              <input type="file" accept="image/*" onChange={(event) => event.target.files?.[0] && uploadImage(event.target.files[0])} />
            </span>
          </label>
          {form.imageUrl ? <img className="menu-preview" src={form.imageUrl} alt="菜品图片预览" /> : null}
          <button className="primary-button" type="submit">
            保存菜品
          </button>
        </form>
      </section>

      <section className="grid menu-grid">
        {menuItems.map((item) => {
          const optionForm = getOptionForm(item.id);

          return (
            <article className="menu-item" key={item.id}>
              {item.imageUrl ? <img className="menu-thumb" src={item.imageUrl} alt={item.name} /> : null}
              <strong>{item.name}</strong>
              <p className="muted">{item.category?.name} / {(item.price / 100).toFixed(2)} 元</p>
              <div className="payment-actions">
                {statuses.map((status) => (
                  <button className="button" type="button" key={status} onClick={() => updateMenuItemStatus(item, status)}>
                    {status}
                  </button>
                ))}
              </div>

              <div className="option-admin-panel">
                <strong>规格</strong>
                {(item.options ?? []).map((option) => (
                  <div className="ticket-item" key={option.id}>
                    <span>
                      {option.name} / {option.type}
                      {option.required ? ' / required' : ''}
                      <span className="muted"> {option.values.map((value) => `${value.name}${value.priceDelta ? `+${value.priceDelta}` : ''}`).join(', ')}</span>
                    </span>
                    <button className="button" type="button" onClick={() => editOption(option)}>
                      编辑
                    </button>
                    <button className="button danger-button" type="button" onClick={() => deleteOption(option)}>
                      删除
                    </button>
                  </div>
                ))}
                <div className="option-form">
                  <input
                    placeholder="规格名"
                    value={optionForm.name}
                    onChange={(event) => setOptionForms((current) => ({ ...current, [item.id]: { ...optionForm, name: event.target.value } }))}
                  />
                  <select
                    value={optionForm.type}
                    onChange={(event) =>
                      setOptionForms((current) => ({ ...current, [item.id]: { ...optionForm, type: event.target.value as OptionForm['type'] } }))
                    }
                  >
                    <option value="single">single</option>
                    <option value="multiple">multiple</option>
                  </select>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={optionForm.required}
                      onChange={(event) => setOptionForms((current) => ({ ...current, [item.id]: { ...optionForm, required: event.target.checked } }))}
                    />
                    必选
                  </label>
                  <textarea
                    value={optionForm.valuesText}
                    onChange={(event) => setOptionForms((current) => ({ ...current, [item.id]: { ...optionForm, valuesText: event.target.value } }))}
                  />
                  <button className="button" type="button" onClick={() => createOption(item)}>
                    添加规格
                  </button>
                </div>
              </div>
            </article>
          );
        })}
      </section>
    </main>
  );
}
