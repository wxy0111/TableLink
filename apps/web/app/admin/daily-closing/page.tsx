import { AuthRequired } from '../../auth-required';
import { getAuthHeaders, hasAuthToken } from '../../auth-session';
import { AdminRealtimeRefresh } from '../realtime-refresh';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

type DailyClosing = {
  date: string;
  businessDate?: string;
  businessDayStart?: number;
  from: string;
  to: string;
  totals: {
    grossAmount: number;
    itemSaleAmount: number;
    paidAmount: number;
    refundAmount: number;
    netPaidAmount: number;
    voidAmount: number;
    discountAmount: number;
    adjustmentAmount: number;
    unpaidAmount: number;
    orderCount: number;
    paidOrderCount: number;
    refundCount: number;
    voidItemCount: number;
    pendingPrintJobCount: number;
    failedPrintJobCount: number;
  };
  paymentMethods: { method: string; paidAmount: number; refundAmount: number }[];
  refundedItems: { id: string; orderNo: string; tableName: string; name: string; quantity: number; amount: number }[];
  unpaidOrders: { id: string; orderNo: string; tableName: string; totalAmount: number; remainingAmount: number; paymentStatus: string }[];
  shift?: { id: string; status: string; openedAt: string; closedAt?: string | null; openingCashAmount: number; closingCashAmount?: number | null; note?: string | null } | null;
  auditLogs: { id: string; action: string; summary: string; tableName: string | null; orderNo: string | null; createdAt: string }[];
  printJobs: { id: string; jobType: string; status: string; title: string; tableName: string | null; orderNo: string | null; createdAt: string }[];
};

type DailyClosingCheck = {
  canClose: boolean;
  unpaidOrders: { id: string; orderNo: string; tableName: string; remainingAmount: number; paymentStatus: string }[];
  openTables: { id: string; name: string; status: string }[];
  openShift: { id: string; status: string; openedAt: string } | null;
  pendingPrintJobCount: number;
  failedPrintJobCount: number;
};

type ReportSummary = {
  averageOrderAmount: number;
  tableTurnoverRate: number;
  paidOrderCount: number;
  tableCount: number;
  hourlySales: { hour: string; orderCount: number; salesAmount: number }[];
  kitchenEfficiency: {
    averageReadyMinutes: number;
    averageServeMinutes: number;
    overdueItemCount: number;
    overdueThresholdMinutes: number;
  };
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

function formatPercent(value: number) {
  return `${(value * 100).toFixed(0)}%`;
}

async function getDailyClosing() {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/daily-closing`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return null;
  return (await response.json()) as DailyClosing;
}

async function getDailyClosingCheck() {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/daily-closing/check`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return null;
  return (await response.json()) as DailyClosingCheck;
}

async function getSummary() {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/summary?period=daily`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return null;
  return (await response.json()) as ReportSummary;
}

export default async function DailyClosingPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="日结对账需要登录" />;

  const [closing, closingCheck, summary] = await Promise.all([getDailyClosing(), getDailyClosingCheck(), getSummary()]);
  const totals = closing?.totals;

  return (
    <main className="shell">
      <AdminRealtimeRefresh />
      <header className="topbar">
        <div>
          <div className="brand">日结对账</div>
          <p className="muted">{closing?.date ?? '今日'} 营业、收款、退款、退菜和异常项</p>
        </div>
        <nav className="nav">
          <a href="/admin">后台</a>
          <a href="/staff">收银台</a>
          <a href="/admin/backups">备份</a>
        </nav>
      </header>

      {closing ? (
        <section className="notice-box">
          <strong>Business day {closing.businessDate ?? closing.date}</strong>
          <p>
            {formatTime(closing.from)} - {formatTime(closing.to)} / start minute {closing.businessDayStart ?? 0}
          </p>
        </section>
      ) : null}

      {closingCheck ? (
        <section className="notice-box">
          <strong>{closingCheck.canClose ? 'Daily closing check passed' : 'Daily closing blocked'}</strong>
          <p>
            Unpaid orders: {closingCheck.unpaidOrders.length} / Open tables: {closingCheck.openTables.length} / Open shift:{' '}
            {closingCheck.openShift ? 'yes' : 'no'} / Failed print jobs: {closingCheck.failedPrintJobCount}
          </p>
        </section>
      ) : null}

      <section className="metric-grid">
        <article className="metric-card">
          <span className="muted">营业额</span>
          <strong>{formatMoney(totals?.grossAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">原价销售</span>
          <strong>{formatMoney(totals?.itemSaleAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">实收</span>
          <strong>{formatMoney(totals?.netPaidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">退款</span>
          <strong>{formatMoney(totals?.refundAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">退菜</span>
          <strong>{formatMoney(totals?.voidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">折扣/减免</span>
          <strong>{formatMoney(totals?.discountAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">服务费/调整</span>
          <strong>{formatMoney(totals?.adjustmentAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">未结</span>
          <strong>{formatMoney(totals?.unpaidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">打印异常</span>
          <strong>
            <a href="/print">{totals?.failedPrintJobCount ?? 0}</a>
          </strong>
        </article>
        <article className="metric-card">
          <span className="muted">翻台率</span>
          <strong>{formatPercent(summary?.tableTurnoverRate ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">客单价</span>
          <strong>{formatMoney(summary?.averageOrderAmount ?? 0)}</strong>
        </article>
      </section>

      <section className="admin-grid">
        <article className="card">
          <h2>Shift</h2>
          <div className="grid">
            <div className="ticket-item">
              <span>{closing?.shift ? formatTime(closing.shift.openedAt) : 'No shift'}</span>
              <strong>{closing?.shift?.status ?? 'none'}</strong>
            </div>
          </div>
        </article>

        <article className="card">
          <h2>Open tables</h2>
          <div className="grid">
            {(closingCheck?.openTables ?? []).map((table) => (
              <div className="ticket-item" key={table.id}>
                <span>{table.name}</span>
                <strong>{table.status}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>支付方式</h2>
          <div className="grid">
            {(closing?.paymentMethods ?? []).map((item) => (
              <div className="ticket-item" key={item.method}>
                <span>{item.method}</span>
                <strong>
                  {formatMoney(item.paidAmount)} / 退 {formatMoney(item.refundAmount)}
                </strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>高峰时段</h2>
          <div className="grid">
            {(summary?.hourlySales ?? [])
              .filter((item) => item.orderCount > 0)
              .slice(0, 8)
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
          <h2>未结订单</h2>
          <div className="grid">
            {(closing?.unpaidOrders ?? []).map((order) => (
              <div className="ticket-item" key={order.id}>
                <span>
                  {order.tableName} / {order.orderNo}
                </span>
                <strong>{formatMoney(order.remainingAmount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>退菜记录</h2>
          <div className="grid">
            {(closing?.refundedItems ?? []).map((item) => (
              <div className="ticket-item" key={item.id}>
                <span>
                  {item.tableName} / {item.name} x {item.quantity}
                </span>
                <strong>{formatMoney(item.amount)}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card">
          <h2>打印任务</h2>
          <div className="grid">
            {(closing?.printJobs ?? []).slice(0, 12).map((job) => (
              <div className="ticket-item" key={job.id}>
                <span>
                  {formatTime(job.createdAt)} / {job.title}
                </span>
                <strong>{job.status}</strong>
              </div>
            ))}
          </div>
        </article>

        <article className="card wide-card">
          <h2>操作流水</h2>
          <div className="grid">
            {(closing?.auditLogs ?? []).slice(0, 20).map((log) => (
              <div className="ticket-item" key={log.id}>
                <span>
                  {formatTime(log.createdAt)} / {log.tableName ?? '-'} / {log.summary}
                </span>
                <strong>{log.action}</strong>
              </div>
            ))}
          </div>
        </article>
      </section>
    </main>
  );
}
