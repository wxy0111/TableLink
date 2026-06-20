'use client';

import { KeyRound, Power, RefreshCcw, UserPlus } from 'lucide-react';
import { FormEvent, useState } from 'react';

type Role = 'owner' | 'manager' | 'cashier' | 'waiter' | 'kitchen';
type UserStatus = 'active' | 'inactive';

type StaffUser = {
  id: string;
  name: string;
  phone: string | null;
  role: Role;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

const roles: Role[] = ['owner', 'manager', 'cashier', 'waiter', 'kitchen'];
const statuses: UserStatus[] = ['active', 'inactive'];

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, options);
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(body?.message ?? '操作失败');
  }
  return body;
}

function formatDate(value: string) {
  return new Date(value).toLocaleString();
}

export function UsersManagerClient({ initialUsers }: { initialUsers: StaffUser[] }) {
  const [users, setUsers] = useState(initialUsers);
  const [message, setMessage] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [createForm, setCreateForm] = useState({ name: '', phone: '', role: 'waiter' as Role, pin: '' });
  const [pinByUser, setPinByUser] = useState<Record<string, string>>({});

  async function refresh() {
    const response = await fetch('/api/admin/users', { cache: 'no-store' });
    if (response.ok) setUsers(await response.json());
  }

  async function run(label: string, action: () => Promise<void>) {
    setBusyId(label);
    setMessage('');
    try {
      await action();
      setMessage(`${label} 已完成`);
      await refresh();
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '操作失败');
    } finally {
      setBusyId(null);
    }
  }

  async function createUser(event: FormEvent) {
    event.preventDefault();
    if (!/^\d{4,8}$/.test(createForm.pin)) {
      setMessage('PIN 必须是 4-8 位数字');
      return;
    }

    await run('新增员工', async () => {
      await request('/api/admin/users', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(createForm),
      });
      setCreateForm({ name: '', phone: '', role: 'waiter', pin: '' });
    });
  }

  async function updateUser(user: StaffUser, patch: Partial<StaffUser>) {
    await run(`更新 ${user.name}`, async () => {
      await request(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify(patch),
      });
    });
  }

  async function resetPin(user: StaffUser) {
    const pin = pinByUser[user.id] ?? '';
    if (!/^\d{4,8}$/.test(pin)) {
      setMessage('PIN 必须是 4-8 位数字');
      return;
    }

    await run(`重置 ${user.name} PIN`, async () => {
      await request(`/api/admin/users/${user.id}/reset-pin`, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ pin }),
      });
      setPinByUser((current) => ({ ...current, [user.id]: '' }));
    });
  }

  async function toggleUser(user: StaffUser) {
    await run(`${user.status === 'active' ? '停用' : '启用'} ${user.name}`, async () => {
      await request(`/api/admin/users/${user.id}/${user.status === 'active' ? 'deactivate' : 'activate'}`, { method: 'POST' });
    });
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">员工管理</div>
          <p className="muted">维护登录账号、角色、状态和 PIN。</p>
        </div>
        <nav className="nav">
          <a href="/admin">报表</a>
          <a href="/admin/menu">菜单</a>
          <a href="/admin/tables">桌码</a>
        </nav>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <form className="card user-form" onSubmit={createUser}>
        <input placeholder="姓名" value={createForm.name} onChange={(event) => setCreateForm({ ...createForm, name: event.target.value })} />
        <input placeholder="手机号" value={createForm.phone} onChange={(event) => setCreateForm({ ...createForm, phone: event.target.value })} />
        <select value={createForm.role} onChange={(event) => setCreateForm({ ...createForm, role: event.target.value as Role })}>
          {roles.map((role) => (
            <option value={role} key={role}>
              {role}
            </option>
          ))}
        </select>
        <input placeholder="PIN" type="password" value={createForm.pin} onChange={(event) => setCreateForm({ ...createForm, pin: event.target.value })} />
        <button className="button" type="submit" disabled={Boolean(busyId)}>
          <UserPlus size={16} />
          新增
        </button>
        <button className="button" type="button" onClick={refresh}>
          <RefreshCcw size={16} />
          刷新
        </button>
      </form>

      <section className="grid user-list">
        {users.map((user) => (
          <article className="card user-row" key={user.id}>
            <div>
              <strong>{user.name}</strong>
              <p className="muted">{user.phone ?? '-'}</p>
            </div>
            <select value={user.role} onChange={(event) => updateUser(user, { role: event.target.value as Role })}>
              {roles.map((role) => (
                <option value={role} key={role}>
                  {role}
                </option>
              ))}
            </select>
            <select value={user.status} onChange={(event) => updateUser(user, { status: event.target.value as UserStatus })}>
              {statuses.map((status) => (
                <option value={status} key={status}>
                  {status}
                </option>
              ))}
            </select>
            <div className="muted">
              <span>{formatDate(user.createdAt)}</span>
              <span>{formatDate(user.updatedAt)}</span>
            </div>
            <div className="inline-form compact-form">
              <input
                placeholder="新 PIN"
                type="password"
                value={pinByUser[user.id] ?? ''}
                onChange={(event) => setPinByUser((current) => ({ ...current, [user.id]: event.target.value }))}
              />
              <button className="icon-button" type="button" disabled={Boolean(busyId)} onClick={() => resetPin(user)} title="重置 PIN">
                <KeyRound size={16} />
              </button>
              <button className="icon-button danger-button" type="button" disabled={Boolean(busyId)} onClick={() => toggleUser(user)} title={user.status === 'active' ? '停用' : '启用'}>
                <Power size={16} />
              </button>
            </div>
          </article>
        ))}
      </section>
    </main>
  );
}
