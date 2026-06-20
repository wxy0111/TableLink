import { AuthRequired } from '../auth-required';
import { getAuthHeaders, hasAuthToken } from '../auth-session';
import { AdminRealtimeRefresh } from './realtime-refresh';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

type ReportSummary = {
  period: string;
  grossSalesAmount: number;
  voidAmount: number;
  discountAmount: number;
  adjustmentAmount: number;
  netSalesAmount: number;
  grossAmount: number;
  paidAmount: number;
  netPaidAmount: number;
  unpaidAmount: number;
  refundAmount: number;
  orderCount: number;
  paidOrderCount: number;
  averageOrderAmount: number;
  occupiedTableCount: number;
  tableCount: number;
  tableTurnoverRate: number;
  topItems: { name: string; quantity: number; amount: number }[];
  paymentMethods: { method: string; amount: number; percentage: number }[];
  voidReasons: { reason: string; count: number; amount: number }[];
  hourlySales: { hour: string; orderCount: number; salesAmount: number }[];
  kitchenEfficiency: {
    averageReadyMinutes: number;
    averageServeMinutes: number;
    overdueItemCount: number;
    overdueThresholdMinutes: number;
  };
  unpaidOrders: { orderNo: string; tableName: string; totalAmount: number; paymentStatus: string }[];
};

type LocalAccess = {
  addresses: { name: string; address: string; webUrl: string; apiUrl: string }[];
};

type SystemHealth = {
  api: string;
  database: string;
  realtime: string;
  storage: string;
  version: string;
  checkedAt: string;
  errors: string[];
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

async function getSummary(period: string) {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/summary?period=${period}`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return null;
  return (await response.json()) as ReportSummary;
}

async function getLocalAccess() {
  const response = await fetch(`${apiBaseUrl}/api/system/local-access`, { cache: 'no-store' });
  if (!response.ok) return { addresses: [] };
  return (await response.json()) as LocalAccess;
}

async function getHealth() {
  const response = await fetch(`${apiBaseUrl}/api/system/health`, { cache: 'no-store' });
  if (!response.ok) return null;
  return (await response.json()) as SystemHealth;
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string }>;
}) {
  if (!(await hasAuthToken())) return <AuthRequired title="店长后台需要登录" />;
  const { period = 'daily' } = await searchParams;
  const [summary, localAccess, health] = await Promise.all([getSummary(period), getLocalAccess(), getHealth()]);

  return (
    <main className="shell">
      <AdminRealtimeRefresh />
      <header className="topbar">
        <div>
          <div className="brand brand-lockup">
            <img src="/tablelink-logo.svg" alt="TableLink" />
            <span>店长后台</span>
          </div>
          <p className="muted">经营信息、局域网访问地址和支付概览</p>
        </div>
        <nav className="nav">
          <a href="/setup">初始化</a>
          <a href="/admin/menu">菜品</a>
          <a href="/admin/tables">桌台二维码</a>
          <a href="/admin/users">员工</a>
          <a href="/admin/backups">备份恢复</a>
          <a href="/admin/daily-closing">日结</a>
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
          <strong>{formatMoney(summary?.netSalesAmount ?? summary?.grossAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">净实收</span>
          <strong>{formatMoney(summary?.netPaidAmount ?? summary?.paidAmount ?? 0)}</strong>
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
          <span className="muted">翻台率</span>
          <strong>{formatPercent(summary?.tableTurnoverRate ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">原价销售</span>
          <strong>{formatMoney(summary?.grossSalesAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">退菜/折扣/调整</span>
          <strong>
            {formatMoney(summary?.voidAmount ?? 0)} / {formatMoney(summary?.discountAmount ?? 0)} / {formatMoney(summary?.adjustmentAmount ?? 0)}
          </strong>
        </article>
      </section>

      <section className="admin-grid">
        <article className="card">
          <h2>支付方式</h2>
          <div className="grid">
            {(summary?.paymentMethods ?? []).map((item) => (
              <div className="ticket-item" key={item.method}>
                <span>{item.method}</span>
                <strong>
                  {formatMoney(item.amount)} / {item.percentage.toFixed(2)}%
                </strong>
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
          <h2>高峰时段</h2>
          <div className="grid">
            {(summary?.hourlySales ?? [])
              .filter((item) => item.orderCount > 0)
              .slice(0, 10)
              .map((item) => (
                <div className="ticket-item" key={item.hour}>
                  <span>
                    {item.hour} / {item.orderCount} 单
                  </span>
                  <strong>{formatMoney(item.salesAmount)}</strong>
                </div>
              ))}
          </div>
        </article>

        <article className="card">
          <h2>出餐效率</h2>
          <div className="grid">
            <div className="ticket-item">
              <span>平均出餐</span>
              <strong>{summary?.kitchenEfficiency.averageReadyMinutes ?? 0} 分钟</strong>
            </div>
            <div className="ticket-item">
              <span>平均上菜</span>
              <strong>{summary?.kitchenEfficiency.averageServeMinutes ?? 0} 分钟</strong>
            </div>
            <div className="ticket-item">
              <span>超时菜品</span>
              <strong>{summary?.kitchenEfficiency.overdueItemCount ?? 0}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <h2>退菜原因</h2>
          <div className="grid">
            {(summary?.voidReasons ?? []).map((item) => (
              <div className="ticket-item" key={item.reason}>
                <span>
                  {item.reason} / {item.count} 次
                </span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>系统状态</h2>
          <div className="grid">
            <div className="ticket-item">
              <span>API / DB / Realtime / Storage</span>
              <strong>
                {health?.api ?? 'unknown'} / {health?.database ?? '-'} / {health?.realtime ?? '-'} / {health?.storage ?? '-'}
              </strong>
            </div>
            <div className="ticket-item">
              <span>Version</span>
              <strong>{health?.version ?? '-'}</strong>
            </div>
            {(health?.errors ?? []).map((error) => (
              <div className="ticket-item" key={error}>
                <span>{error}</span>
                <strong>check</strong>
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
