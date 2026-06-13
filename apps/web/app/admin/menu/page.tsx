import { MenuManagerClient } from './menu-manager-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getData() {
  const [categoriesResponse, menuItemsResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/api/admin/categories`, { cache: 'no-store' }),
    fetch(`${apiBaseUrl}/api/admin/menu-items`, { cache: 'no-store' }),
  ]);

  return {
    categories: categoriesResponse.ok ? await categoriesResponse.json() : [],
    menuItems: menuItemsResponse.ok ? await menuItemsResponse.json() : [],
  };
}

export default async function AdminMenuPage() {
  const data = await getData();

  return <MenuManagerClient initialCategories={data.categories} initialMenuItems={data.menuItems} />;
}

