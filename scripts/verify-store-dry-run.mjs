const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

async function request(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    const error = new Error(`${options.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
    error.status = response.status;
    error.body = body;
    throw error;
  }

  return body;
}

async function expectFailure(path, options = {}) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  if (response.ok) {
    const text = await response.text();
    throw new Error(`Expected ${options.method ?? 'GET'} ${path} to fail, got ${response.status}: ${text}`);
  }
  return response.status;
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

function jsonBody(body) {
  return {
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify(body),
  };
}

function selectedOptionsFor(item) {
  return (item.options ?? [])
    .filter((option) => option.required)
    .flatMap((option) => {
      const firstValue = Array.isArray(option.values) ? option.values[0] : null;
      return firstValue ? [{ optionName: option.name, valueName: firstValue.name }] : [];
    });
}

function netPaid(order) {
  const payments = order.payments ?? [];
  const paid = payments.filter((payment) => payment.status === 'paid').reduce((sum, payment) => sum + payment.amount, 0);
  const refunded = payments.filter((payment) => payment.status === 'refunded').reduce((sum, payment) => sum + payment.amount, 0);
  return paid - refunded;
}

async function createDryRunTable(ownerToken, label) {
  const suffix = `${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
  return request(
    '/api/admin/tables',
    withAuth(ownerToken, {
      method: 'POST',
      ...jsonBody({
        name: `${label}-${suffix.slice(-4)}`,
        code: `DRY-${label}-${suffix}`,
        capacity: 2,
      }),
    }),
  );
}

async function createCustomerOrder(tableCode, item, quantity = 1) {
  return request('/api/public/orders', {
    method: 'POST',
    ...jsonBody({
      tableCode,
      remark: `dry-run ${tableCode}`,
      items: [
        {
          menuItemId: item.id,
          quantity,
          remark: 'dry-run customer order',
          options: selectedOptionsFor(item),
        },
      ],
    }),
  });
}

async function payRemainingCash(token, order, note) {
  const remaining = Math.max(order.totalAmount - netPaid(order), 0);
  if (remaining <= 0) return order;
  return request(
    `/api/staff/orders/${order.id}/payments`,
    withAuth(token, {
      method: 'POST',
      ...jsonBody({ method: 'cash', amount: remaining, note }),
    }),
  );
}

async function main() {
  const health = await request('/api/system/health');
  if (health.database !== 'ok' || health.storage !== 'ok') {
    throw new Error(`Health check is not ready: ${JSON.stringify(health)}`);
  }

  const owner = await login('13800000000', '1111');
  const cashier = await login('13800000002', '3333');
  const kitchen = await login('13800000001', '2222');
  const waiter = await login('13800000003', '4444');

  const currentShift = await request('/api/staff/shifts/current', withAuth(cashier.token));
  let openedShift = currentShift;
  let openedShiftByScript = false;
  if (!currentShift) {
    openedShift = await request(
      '/api/staff/shifts/open',
      withAuth(cashier.token, {
        method: 'POST',
        ...jsonBody({ openingCashAmount: 10000, note: 'dry-run shift open' }),
      }),
    );
    openedShiftByScript = true;
  }

  const [tableA, tableB] = await Promise.all([createDryRunTable(owner.token, 'A'), createDryRunTable(owner.token, 'B')]);
  const menu = await request('/api/admin/menu-items', withAuth(owner.token));
  const activeItems = menu.filter((item) => item.status === 'active');
  const itemA = activeItems[0];
  const itemB = activeItems[1] ?? activeItems[0];
  const addItem = activeItems[2] ?? activeItems[0];
  const soldOutItem = activeItems[3] ?? activeItems[0];

  if (!itemA || !itemB || !addItem || !soldOutItem) {
    throw new Error('Dry run requires at least one active menu item');
  }

  const orderA = await createCustomerOrder(tableA.code, itemA, 1);
  const orderB = await createCustomerOrder(tableB.code, itemB, 1);

  await request(`/api/public/tables/${tableB.code}/service-calls`, {
    method: 'POST',
    ...jsonBody({ message: 'dry-run service call' }),
  });

  for (const item of [...orderA.items, ...orderB.items]) {
    await request(`/api/kitchen/orders/order-items/${item.id}/start`, withAuth(kitchen.token, { method: 'PATCH' }));
    await request(`/api/kitchen/orders/order-items/${item.id}/ready`, withAuth(kitchen.token, { method: 'PATCH' }));
    await request(`/api/service/order-items/${item.id}/served`, withAuth(waiter.token, { method: 'PATCH' }));
  }

  const serviceTasks = await request('/api/service/tasks', withAuth(waiter.token));
  const dryRunCall = serviceTasks.calls?.find((call) => call.tableName === tableB.name);
  if (!dryRunCall) {
    throw new Error('Dry-run service call did not appear in service tasks');
  }
  await request(`/api/service/calls/${dryRunCall.id}/acknowledge`, withAuth(waiter.token, { method: 'PATCH' }));
  await request(`/api/service/calls/${dryRunCall.id}/resolve`, withAuth(waiter.token, { method: 'PATCH' }));

  const addedItem = await request(
    `/api/staff/orders/${orderA.id}/items`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ menuItemId: addItem.id, quantity: 1, remark: 'dry-run add item', options: selectedOptionsFor(addItem) }),
    }),
  );

  await request(
    `/api/staff/menu-items/${soldOutItem.id}/status`,
    withAuth(cashier.token, {
      method: 'PATCH',
      ...jsonBody({ status: 'sold_out' }),
    }),
  );

  const soldOutRejectedStatus = await expectFailure('/api/public/orders', {
    method: 'POST',
    ...jsonBody({
      tableCode: tableB.code,
      items: [{ menuItemId: soldOutItem.id, quantity: 1, options: selectedOptionsFor(soldOutItem) }],
    }),
  });

  await request(
    `/api/staff/menu-items/${soldOutItem.id}/status`,
    withAuth(cashier.token, {
      method: 'PATCH',
      ...jsonBody({ status: 'active' }),
    }),
  );

  await request(
    `/api/staff/orders/${orderA.id}/items/${addedItem.id}/refund`,
    withAuth(cashier.token, {
      method: 'PATCH',
      ...jsonBody({ reason: 'dry-run item void' }),
    }),
  );

  const discountedB = await request(
    `/api/staff/orders/${orderB.id}/adjustments`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ type: 'rounding', amount: Math.min(10, Math.max(orderB.totalAmount - 1, 1)), reason: 'dry-run rounding' }),
    }),
  );

  const afterRefundA = await request(`/api/public/orders/${orderA.id}?token=${orderA.customerAccessToken}`);
  const intentA = await request(
    `/api/staff/orders/${orderA.id}/payment-intents`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ method: 'wechat', amount: afterRefundA.totalAmount }),
    }),
  );
  const paidA = await request(
    `/api/staff/payment-intents/${intentA.paymentId}/mark-paid`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ providerTradeNo: `DRY-${Date.now()}` }),
    }),
  );

  const paidB = await payRemainingCash(cashier.token, discountedB, 'dry-run cash payment');

  const reopenedA = await request(
    `/api/staff/orders/${orderA.id}/reopen`,
    withAuth(owner.token, {
      method: 'POST',
      ...jsonBody({ reason: 'dry-run reopen for service charge' }),
    }),
  );

  const adjustedA = await request(
    `/api/staff/orders/${orderA.id}/adjustments`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ type: 'service_charge', amount: 100, reason: 'dry-run service charge' }),
    }),
  );
  const repaidA = await payRemainingCash(cashier.token, adjustedA, 'dry-run extra collection');

  const pendingPrintJobs = await request('/api/staff/print-jobs?status=pending', withAuth(cashier.token));
  const printJob = pendingPrintJobs.find((job) => job.orderId === orderA.id || job.orderId === orderB.id) ?? pendingPrintJobs[0];
  let retriedPrintJob = null;
  if (printJob) {
    await request(
      `/api/staff/print-jobs/${printJob.id}/mark-failed`,
      withAuth(cashier.token, {
        method: 'POST',
        ...jsonBody({ error: 'dry-run printer offline' }),
      }),
    );
    retriedPrintJob = await request(`/api/staff/print-jobs/${printJob.id}/retry`, withAuth(cashier.token, { method: 'POST' }));
  }

  await request(
    `/api/staff/tables/${tableA.id}/clear`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ reason: 'dry-run clear A' }),
    }),
  );
  await request(
    `/api/staff/tables/${tableB.id}/clear`,
    withAuth(cashier.token, {
      method: 'POST',
      ...jsonBody({ reason: 'dry-run clear B' }),
    }),
  );

  const summary = await request('/api/admin/reports/summary?period=daily', withAuth(owner.token));
  const closingCheckBeforeShiftClose = await request('/api/admin/reports/daily-closing/check', withAuth(owner.token));
  const backup = await request('/api/admin/backups/export', withAuth(owner.token));

  let closedShift = null;
  if (openedShiftByScript && openedShift?.id) {
    closedShift = await request(
      `/api/staff/shifts/${openedShift.id}/close`,
      withAuth(cashier.token, {
        method: 'POST',
        ...jsonBody({ closingCashAmount: 10000, note: 'dry-run shift close' }),
      }),
    );
  }

  const auditLogs = await request('/api/staff/audit-logs', withAuth(cashier.token));
  const requiredAuditActions = ['order_item.refunded', 'order.adjustment.rounding', 'order.reopened', 'order.adjustment.service_charge', 'table.cleared'];
  const auditActions = new Set(auditLogs.map((entry) => entry.action));
  const missingAuditActions = requiredAuditActions.filter((action) => !auditActions.has(action));
  if (missingAuditActions.length) {
    throw new Error(`Missing dry-run audit actions: ${missingAuditActions.join(', ')}`);
  }

  if (soldOutRejectedStatus < 400) {
    throw new Error('Sold-out customer order was not rejected');
  }
  if (paidA.paymentStatus !== 'paid' || paidB.paymentStatus !== 'paid' || reopenedA.paymentStatus !== 'partially_paid' || repaidA.paymentStatus !== 'paid') {
    throw new Error('Payment or reopen status did not match dry-run expectations');
  }
  if (backup.version !== 2 || !backup.metadata?.counts?.orders) {
    throw new Error('Backup export did not include version 2 operating data');
  }

  console.log(
    JSON.stringify(
      {
        health: health.api,
        shift: openedShiftByScript ? 'opened-and-closed-by-script' : 'existing-shift-reused',
        closedShiftId: closedShift?.id ?? null,
        tableA: tableA.name,
        tableB: tableB.name,
        orderA: orderA.orderNo,
        orderB: orderB.orderNo,
        soldOutRejectedStatus,
        onlinePaymentIntent: intentA.paymentId,
        reopenedOrderStatus: reopenedA.paymentStatus,
        finalOrderAStatus: repaidA.paymentStatus,
        finalOrderBStatus: paidB.paymentStatus,
        printRetryStatus: retriedPrintJob?.status ?? 'no-print-job',
        tableTurnoverRate: summary.tableTurnoverRate,
        dailyClosingCanClose: closingCheckBeforeShiftClose.canClose,
        backupVersion: backup.version,
        backupOrderCount: backup.metadata.counts.orders,
        verifiedAuditActions: requiredAuditActions.length,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
