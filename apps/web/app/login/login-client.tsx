'use client';

import { LogIn } from 'lucide-react';
import { useState } from 'react';

const roleHome: Record<string, string> = {
  owner: '/admin',
  manager: '/admin',
  cashier: '/staff',
  waiter: '/service',
  kitchen: '/kitchen',
};

const demoAccounts = [
  ['老板', '13800000000', '1111'],
  ['后厨', '13800000001', '2222'],
  ['收银', '13800000002', '3333'],
  ['服务员', '13800000003', '4444'],
  ['店长', '13800000004', '5555'],
];

export function LoginClient() {
  const [phone, setPhone] = useState('13800000000');
  const [pin, setPin] = useState('1111');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  async function login() {
    setLoading(true);
    setMessage('');
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({ phone, pin }),
      });
      const body = await response.json();
      if (!response.ok) {
        throw new Error(body?.message ?? '登录失败');
      }

      localStorage.setItem('tablelink_token', body.token);
      document.cookie = `tablelink_token=${encodeURIComponent(body.token)}; path=/; max-age=43200; SameSite=Lax`;
      window.location.href = roleHome[body.user.role] ?? '/';
    } catch (caught) {
      setMessage(caught instanceof Error ? caught.message : '登录失败');
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="shell auth-shell">
      <section className="form-panel auth-panel">
        <div>
          <div className="brand">TableLink 登录</div>
          <p className="muted">使用员工手机号和 PIN 进入对应工作台</p>
        </div>
        <label>
          手机号
          <input value={phone} onChange={(event) => setPhone(event.target.value)} />
        </label>
        <label>
          PIN
          <input value={pin} onChange={(event) => setPin(event.target.value)} type="password" />
        </label>
        <button className="button primary-button" type="button" disabled={loading} onClick={login}>
          <LogIn size={16} />
          登录
        </button>
        {message ? <div className="notice-box">{message}</div> : null}
        <div className="chip-list">
          {demoAccounts.map(([label, accountPhone, accountPin]) => (
            <button
              className="button"
              type="button"
              key={accountPhone}
              onClick={() => {
                setPhone(accountPhone);
                setPin(accountPin);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </section>
    </main>
  );
}
