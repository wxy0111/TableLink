'use client';

import { Download, Upload } from 'lucide-react';
import { useState } from 'react';

export function BackupClient() {
  const [message, setMessage] = useState('');

  async function exportBackup() {
    const response = await fetch('/api/admin/backups/export', { cache: 'no-store' });
    if (!response.ok) {
      setMessage('导出失败');
      return;
    }

    const backup = await response.json();
    const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const restaurantName = typeof backup.metadata?.restaurantName === 'string' ? backup.metadata.restaurantName : 'restaurant';
    link.download = `tablelink-${slugify(restaurantName)}-${new Date().toISOString().replaceAll(':', '').slice(0, 19)}.backup.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage('备份已导出');
  }

  async function restoreBackup(file: File) {
    if (!window.confirm('Restore will overwrite operating data. Continue?')) {
      setMessage('Restore cancelled');
      return;
    }

    const text = await file.text();
    const backup = JSON.parse(text);
    const response = await fetch('/api/admin/backups/restore', {
      method: 'POST',
      headers: { 'content-type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ confirmRestore: true, backup }),
    });

    if (!response.ok) {
      setMessage('恢复失败，请确认备份文件正确');
      return;
    }

    setMessage('恢复完成，请刷新页面检查菜单和桌台');
  }

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">备份恢复</div>
          <p className="muted">导出菜单、桌台和门店配置；恢复会覆盖这些配置数据。</p>
        </div>
        <nav className="nav">
          <a href="/admin">报表</a>
          <a href="/admin/menu">菜品</a>
          <a href="/admin/tables">桌台二维码</a>
        </nav>
      </header>

      {message ? <div className="notice-box">{message}</div> : null}

      <section className="admin-grid">
        <article className="card">
          <h2>导出备份</h2>
          <p className="muted">建议每天营业结束后导出一次，保存到 U 盘或网盘。</p>
          <button className="primary-button" type="button" onClick={exportBackup}>
            <Download size={18} />
            导出 JSON 备份
          </button>
        </article>
        <article className="card">
          <h2>恢复备份</h2>
          <p className="muted">恢复会覆盖门店、桌台、分类、菜品和规格数据。</p>
          <label className="file-button">
            <Upload size={18} />
            选择备份文件
            <input type="file" accept="application/json" onChange={(event) => event.target.files?.[0] && restoreBackup(event.target.files[0])} />
          </label>
        </article>
      </section>
    </main>
  );
}

function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-|-$/g, '') || 'restaurant';
}
