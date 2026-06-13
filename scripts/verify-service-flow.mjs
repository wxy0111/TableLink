const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? process.env.API_BASE_URL ?? 'http://localhost:3001';

async function request(path, options) {
  const response = await fetch(`${apiBaseUrl}${path}`, options);
  const text = await response.text();
  const body = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new Error(`${options?.method ?? 'GET'} ${path} failed: ${response.status} ${text}`);
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

const kitchenSession = await login('13800000001', '2222');
const waiterSession = await login('13800000003', '4444');

const table = await request('/api/public/tables/TABLE-04');
const menu = await request(`/api/public/restaurants/${table.restaurantId}/menu`);
const activeItems = menu.flatMap((category) => category.menuItems).filter((item) => item.status === 'active');
const firstItem = activeItems[0];

if (!firstItem) {
  throw new Error('No active menu item found');
}

const order = await request('/api/public/orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    tableCode: table.code,
    remark: 'verify service flow',
    items: [
      {
        menuItemId: firstItem.id,
        quantity: 1,
        remark: '',
        options: [],
      },
    ],
  }),
});

const serviceCall = await request(`/api/public/tables/${table.code}/service-calls`, {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({ message: 'verify call waiter' }),
});

const kitchenTasks = await request('/api/kitchen/orders/tasks', withAuth(kitchenSession.token));
const kitchenTask = kitchenTasks.find((task) => task.orderId === order.id);
if (!kitchenTask) {
  throw new Error('Created order item was not visible in kitchen tasks');
}

await request(`/api/kitchen/orders/order-items/${kitchenTask.id}/start`, withAuth(kitchenSession.token, { method: 'PATCH' }));
await request(`/api/kitchen/orders/order-items/${kitchenTask.id}/ready`, withAuth(kitchenSession.token, { method: 'PATCH' }));

const serviceTasks = await request('/api/service/tasks', withAuth(waiterSession.token));
const readyItem = serviceTasks.readyItems.find((item) => item.id === kitchenTask.id);
if (!readyItem) {
  throw new Error('Ready item was not visible in service tasks');
}

await request(`/api/service/order-items/${readyItem.id}/served`, withAuth(waiterSession.token, { method: 'PATCH' }));
await request(`/api/service/calls/${serviceCall.id}/resolve`, withAuth(waiterSession.token, { method: 'PATCH' }));

console.log(
  JSON.stringify(
    {
      table: table.name,
      item: firstItem.name,
      orderNo: order.orderNo,
      serviceCallVisible: true,
      kitchenTaskVisible: true,
      readyItemVisible: true,
      served: true,
    },
    null,
    2,
  ),
);
