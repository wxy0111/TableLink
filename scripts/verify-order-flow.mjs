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

const table = await request('/api/public/tables/TABLE-02');
const menu = await request(`/api/public/restaurants/${table.restaurantId}/menu`);
const firstItem = menu.flatMap((category) => category.menuItems).find((item) => item.status === 'active');

if (!firstItem) {
  throw new Error('No active menu item found');
}

const order = await request('/api/public/orders', {
  method: 'POST',
  headers: { 'content-type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    tableCode: table.code,
    remark: 'verify order flow',
    items: [
      {
        menuItemId: firstItem.id,
        quantity: 2,
        remark: '',
        options: [],
      },
    ],
  }),
});

const kitchenOrders = await request('/api/kitchen/orders');
const createdOrderInKitchen = kitchenOrders.find((kitchenOrder) => kitchenOrder.id === order.id);

if (!createdOrderInKitchen) {
  throw new Error(`Created order ${order.orderNo} was not visible in kitchen orders`);
}

console.log(
  JSON.stringify(
    {
      table: table.name,
      item: firstItem.name,
      orderNo: order.orderNo,
      totalAmount: order.totalAmount,
      kitchenVisible: true,
    },
    null,
    2,
  ),
);

