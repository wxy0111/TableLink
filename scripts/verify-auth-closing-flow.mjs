const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
    error.status = response.status;
    throw error;
  }

  return body;
}

async function expectStatus(path, status, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  if (response.status !== status) {
    const text = await response.text();
    throw new Error(`Expected ${path} to return ${status}, got ${response.status}: ${text}`);
  }
}

async function login(phone, pin) {
  return request('/api/auth/login', {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ phone, pin }),
  });
}

const owner = await login('13800000000', '1111');
const cashier = await login('13800000002', '3333');
const kitchen = await login('13800000001', '2222');

if (owner.user.role !== 'owner' || cashier.user.role !== 'cashier' || kitchen.user.role !== 'kitchen') {
  throw new Error('Unexpected login roles');
}

await expectStatus('/api/staff/tables', 401);
await expectStatus('/api/admin/reports/daily-closing', 403, {
  headers: { authorization: `Bearer ${kitchen.token}` },
});

const staffTables = await request('/api/staff/tables', {
  headers: { authorization: `Bearer ${cashier.token}` },
});

const closing = await request('/api/admin/reports/daily-closing', {
  headers: { authorization: `Bearer ${owner.token}` },
});

const me = await request('/api/auth/me', {
  headers: { authorization: `Bearer ${owner.token}` },
});

if (!Array.isArray(staffTables) || !closing.totals || !Array.isArray(closing.auditLogs) || me.role !== 'owner') {
  throw new Error('Auth or daily closing response shape is invalid');
}

console.log(
  JSON.stringify(
    {
      owner: owner.user.name,
      cashier: cashier.user.name,
      kitchenForbiddenFromClosing: true,
      staffTables: staffTables.length,
      grossAmount: closing.totals.grossAmount,
      paidAmount: closing.totals.paidAmount,
      refundAmount: closing.totals.refundAmount,
      auditLogs: closing.auditLogs.length,
      printJobs: closing.printJobs.length,
    },
    null,
    2,
  ),
);
