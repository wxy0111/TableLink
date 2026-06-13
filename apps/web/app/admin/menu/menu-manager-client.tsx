'use client';

import { Upload } from 'lucide-react';
import { FormEvent, useState } from 'react';

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

  async function updateMenuItem(item: MenuItem, patch: Partial<MenuItem>) {
    const response = await fetch(`/api/admin/menu-items/${item.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({
        categoryId: item.categoryId,
        name: item.name,
        description: item.description ?? '',
        price: item.price,
        kitchenStation: item.kitchenStation,
        status: item.status,
        imageUrl: item.imageUrl ?? '',
        ...patch,
      }),
    });
    if (response.ok) {
      await refresh();
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
        {menuItems.map((item) => (
          <article className="menu-item" key={item.id}>
            {item.imageUrl ? <img className="menu-thumb" src={item.imageUrl} alt={item.name} /> : null}
            <strong>{item.name}</strong>
            <p className="muted">{item.category?.name} / {(item.price / 100).toFixed(2)} 元</p>
            <div className="payment-actions">
              {statuses.map((status) => (
                <button className="button" type="button" key={status} onClick={() => updateMenuItem(item, { status })}>
                  {status}
                </button>
              ))}
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}

