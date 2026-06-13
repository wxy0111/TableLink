const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function request(path, options) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
  }

  return body;
}

const tables = await request('/api/staff/tables');
const sourceTable = tables.find((table) => table.code === 'TABLE-05');
const targetTable = tables.find((table) => table.code === 'TABLE-06');
const mergeSourceTable = tables.find((table) => table.code === 'TABLE-07');

if (!sourceTable || !targetTable || !mergeSourceTable) {
  throw new Error('Required verification tables were not found');
}

const menu = await request('/api/admin/menu-items');
const activeItems = menu.filter((item) => item.status === 'active');
const firstItem = activeItems[0];
const secondItem = activeItems[1];

if (!firstItem || !secondItem) {
  throw new Error('At least two active menu items are required');
}

const opened = await request(`/api/staff/tables/${sourceTable.id}/open`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ note: 'verify frontdesk open' }),
});

const addedA = await request(`/api/staff/orders/${opened.order.id}/items`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ menuItemId: firstItem.id, quantity: 1, remark: 'verify add item A', options: [] }),
});

const addedB = await request(`/api/staff/orders/${opened.order.id}/items`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ menuItemId: secondItem.id, quantity: 1, remark: 'verify add item B', options: [] }),
});

await request(`/api/staff/orders/${opened.order.id}/items/${addedA.id}/hold`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ hold: true, reason: 'guest not ready' }),
});

await request(`/api/staff/orders/${opened.order.id}/items/${addedA.id}/urge`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ reason: 'guest asked' }),
});

await request(`/api/staff/orders/${opened.order.id}/items/${addedA.id}/hold`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ hold: false, reason: 'resume cooking' }),
});

await request(`/api/staff/orders/${opened.order.id}/items/${addedB.id}/refund`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ reason: 'verification refund dish' }),
});

const afterRefund = await request(`/api/public/orders/${opened.order.id}`);
const firstPaymentAmount = Math.floor(afterRefund.totalAmount / 2);
const secondPaymentAmount = afterRefund.totalAmount - firstPaymentAmount;

await request(`/api/staff/orders/${opened.order.id}/payments`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ method: 'cash', amount: firstPaymentAmount, note: 'verify split cash' }),
});

const paidOrder = await request(`/api/staff/orders/${opened.order.id}/payments`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ method: 'wechat', amount: secondPaymentAmount, note: 'verify split wechat' }),
});

await request(`/api/staff/orders/${opened.order.id}/refunds`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ method: 'cash', amount: Math.min(100, paidOrder.totalAmount), reason: 'verify payment refund' }),
});

await request(`/api/staff/tables/${sourceTable.id}/move`, {
  method: 'PATCH',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ targetTableId: targetTable.id, reason: 'verify move table' }),
});

const mergeOrder = await request(`/api/staff/tables/${mergeSourceTable.id}/open`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ note: 'verify merge source' }),
});

await request(`/api/staff/tables/merge`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ sourceTableId: mergeSourceTable.id, targetTableId: targetTable.id, reason: 'verify merge table' }),
});

await request(`/api/staff/tables/${sourceTable.id}/clear`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ reason: 'verify clear moved source' }),
});

const auditLogs = await request('/api/staff/audit-logs');
const printJobs = await request('/api/staff/print-jobs');

const expectedActions = ['table.opened', 'order_item.added', 'order_item.held', 'order_item.urged', 'order_item.refunded', 'payment.refunded', 'table.moved', 'table.merged', 'table.cleared'];
const actionSet = new Set(auditLogs.map((entry) => entry.action));
const missingActions = expectedActions.filter((action) => !actionSet.has(action));

if (missingActions.length) {
  throw new Error(`Missing audit actions: ${missingActions.join(', ')}`);
}

if (!printJobs.some((job) => job.jobType === 'kitchen_add_item') || !printJobs.some((job) => job.jobType === 'kitchen_urge')) {
  throw new Error('Expected kitchen print jobs were not created');
}

console.log(
  JSON.stringify(
    {
      openedTable: sourceTable.name,
      movedTo: targetTable.name,
      mergedOrder: mergeOrder.order.orderNo,
      paidOrder: paidOrder.orderNo,
      auditActionsVerified: expectedActions.length,
      pendingPrintJobs: printJobs.filter((job) => job.status === 'pending').length,
    },
    null,
    2,
  ),
);
