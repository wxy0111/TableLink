const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return body;
}

async function login(phone, pin) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ phone, pin }),
  });
}

function withAuth(token, options = {}) {
  return {
    ...options,
    headers: {
      ...(options.headers ?? {}),
      authorization: `Bearer ${token}`,
    },
  };
}

const owner = await login('13800000000', '1111');
const cashier = await login('13800000002', '3333');

const before = await request('/api/admin/reports/daily-closing', withAuth(owner.token));
const menu = await request('/api/admin/menu-items', withAuth(owner.token));
const item = menu.find((entry) => entry.status === 'active');

if (!item) {
  throw new Error('No active menu item found');
}

const suffix = Date.now().toString(36).toUpperCase();
const table = await request('/api/admin/tables', withAuth(owner.token, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    name: `V${suffix.slice(-4)}`,
    code: `VERIFY-${suffix}`,
    capacity: 2,
  }),
}));

const opened = await request(`/api/staff/tables/${table.id}/open`, withAuth(cashier.token, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ note: 'verify ledger open' }),
}));

await request(`/api/staff/orders/${opened.order.id}/items`, withAuth(cashier.token, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ menuItemId: item.id, quantity: 1, remark: 'verify ledger item', options: [] }),
}));

const afterItem = await request(`/api/public/orders/${opened.order.id}`);
const payment = await request(`/api/staff/orders/${opened.order.id}/payments`, withAuth(cashier.token, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ method: 'cash', amount: afterItem.totalAmount, note: 'verify ledger payment' }),
}));

const refundAmount = Math.min(100, payment.totalAmount);
await request(`/api/staff/orders/${opened.order.id}/refunds`, withAuth(cashier.token, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ method: 'cash', amount: refundAmount, reason: 'verify ledger refund' }),
}));

const after = await request('/api/admin/reports/daily-closing', withAuth(owner.token));

const delta = {
  grossAmount: after.totals.grossAmount - before.totals.grossAmount,
  paidAmount: after.totals.paidAmount - before.totals.paidAmount,
  refundAmount: after.totals.refundAmount - before.totals.refundAmount,
  netPaidAmount: after.totals.netPaidAmount - before.totals.netPaidAmount,
};

if (delta.grossAmount !== afterItem.totalAmount) {
  throw new Error(`Expected gross delta ${afterItem.totalAmount}, got ${delta.grossAmount}`);
}

if (delta.paidAmount !== afterItem.totalAmount) {
  throw new Error(`Expected paid delta ${afterItem.totalAmount}, got ${delta.paidAmount}`);
}

if (delta.refundAmount !== refundAmount) {
  throw new Error(`Expected refund delta ${refundAmount}, got ${delta.refundAmount}`);
}

if (delta.netPaidAmount !== afterItem.totalAmount - refundAmount) {
  throw new Error(`Expected net paid delta ${afterItem.totalAmount - refundAmount}, got ${delta.netPaidAmount}`);
}

console.log(
  JSON.stringify(
    {
      table: table.name,
      orderNo: opened.order.orderNo,
      item: item.name,
      grossDelta: delta.grossAmount,
      paidDelta: delta.paidAmount,
      refundDelta: delta.refundAmount,
      netPaidDelta: delta.netPaidAmount,
      ledgerBackedReports: true,
    },
    null,
    2,
  ),
);
