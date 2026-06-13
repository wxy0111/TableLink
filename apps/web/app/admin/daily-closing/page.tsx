import { AuthRequired } from '../../auth-required';
import { getAuthHeaders, hasAuthToken } from '../../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

type DailyClosing = {
  date: string;
  totals: {
    grossAmount: number;
    paidAmount: number;
    refundAmount: number;
    netPaidAmount: number;
    voidAmount: number;
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
  auditLogs: { id: string; action: string; summary: string; tableName: string | null; orderNo: string | null; createdAt: string }[];
  printJobs: { id: string; jobType: string; status: string; title: string; tableName: string | null; orderNo: string | null; createdAt: string }[];
};

function formatMoney(amount: number) {
  return `${(amount / 100).toFixed(2)} 元`;
}

function formatTime(value: string) {
  return new Date(value).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' });
}

async function getDailyClosing() {
  const response = await fetch(`${apiBaseUrl}/api/admin/reports/daily-closing`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return null;
  return (await response.json()) as DailyClosing;
}

export default async function DailyClosingPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="日结对账需要登录" />;

  const closing = await getDailyClosing();
  const totals = closing?.totals;

  return (
    <main className="shell">
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

      <section className="metric-grid">
        <article className="metric-card">
          <span className="muted">营业额</span>
          <strong>{formatMoney(totals?.grossAmount ?? 0)}</strong>
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
          <span className="muted">未结</span>
          <strong>{formatMoney(totals?.unpaidAmount ?? 0)}</strong>
        </article>
        <article className="metric-card">
          <span className="muted">打印异常</span>
          <strong>{totals?.failedPrintJobCount ?? 0}</strong>
        </article>
      </section>

      <section className="admin-grid">
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
