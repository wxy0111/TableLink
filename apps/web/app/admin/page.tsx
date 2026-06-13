const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

type ReportSummary = {
  period: string;
  grossAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  refundAmount: number;
  orderCount: number;
  paidOrderCount: number;
  averageOrderAmount: number;
  occupiedTableCount: number;
  topItems: { name: string; quantity: number; amount: number }[];
  paymentMethods: { method: string; amount: number }[];
  unpaidOrders: { orderNo: string; tableName: string; totalAmount: number; paymentStatus: string }[];
};

type LocalAccess = {
  addresses: { name: string; address: string; webUrl: string; apiUrl: string }[];
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

async function getSummary(period: string) {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/summary?period=${period}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as ReportSummary;
}

async function getLocalAccess() {
  const response = await fetch(`${apiBaseUrl}/api/system/local-access`, { cache: 'no-store' });
  if (!response.ok) return { addresses: [] };
  return (await response.json()) as LocalAccess;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  const { period = 'daily' } = await searchParams;
  const [summary, localAccess] = await Promise.all([getSummary(period), getLocalAccess()]);

  return (
    <main className="shell">
      <header className="topbar">
        <div>
          <div className="brand">店长后台</div>
          <p className="muted">经营信息、局域网访问地址和支付概览</p>
        </div>
        <nav className="nav">
          <a href="/setup">初始化</a>
          <a href="/admin/menu">菜品</a>
          <a href="/admin/tables">桌台二维码</a>
          <a href="/admin/backups">备份恢复</a>
          {['daily', 'weekly', 'monthly', 'quarterly', 'yearly'].map((item) => (
            <a href={`/admin?period=${item}`} key={item}>
              {item}
            </a>
          ))}
        </nav>
      </header>

      <section className="metric-grid">
        <article className="metric-card">
          <span className="muted">营业额</span>
          <strong>{formatMoney(summary?.grossAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">已收款</span>
          <strong>{formatMoney(summary?.paidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">未收款</span>
          <strong>{formatMoney(summary?.unpaidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">订单数</span>
          <strong>{summary?.orderCount ?? 0}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">客单价</span>
          <strong>{formatMoney(summary?.averageOrderAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">营业桌台</span>
          <strong>{summary?.occupiedTableCount ?? 0}</strong>
        </article>
      </section>

      <section className="admin-grid">
        <article className="card">
          <h2>支付方式</h2>
          <div className="grid">
            {(summary?.paymentMethods ?? []).map((item) => (
              <div className="ticket-item" key={item.method}>
                <span>{item.method}</span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>热销菜品</h2>
          <div className="grid">
            {(summary?.topItems ?? []).map((item) => (
              <div className="ticket-item" key={item.name}>
                <span>
                  {item.name} x {item.quantity}
                </span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>未收款订单</h2>
          <div className="grid">
            {(summary?.unpaidOrders ?? []).map((order) => (
              <div className="ticket-item" key={order.orderNo}>
                <span>
                  {order.tableName} / {order.orderNo}
                </span>
                <strong>{formatMoney(order.totalAmount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>局域网访问</h2>
          <div className="grid">
            {localAccess.addresses.map((item) => (
              <div className="local-access-row" key={`${item.name}-${item.address}`}>
                <strong>{item.address}</strong>
                <span className="muted">{item.name}</span>
                <code>{item.webUrl}</code>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
