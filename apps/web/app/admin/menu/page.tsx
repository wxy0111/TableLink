import { MenuManagerClient } from './menu-manager-client';
import { AuthRequired } from '../../auth-required';
import { getAuthHeaders, hasAuthToken } from '../../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getData() {
  const [categoriesResponse, menuItemsResponse] = await Promise.all([
    fetch(`${apiBaseUrl}/api/admin/categories`, { cache: 'no-store', headers: await getAuthHeaders() }),
    fetch(`${apiBaseUrl}/api/admin/menu-items`, { cache: 'no-store', headers: await getAuthHeaders() }),
  ]);

  return {
    categories: categoriesResponse.ok ? await categoriesResponse.json() : [],
    menuItems: menuItemsResponse.ok ? await menuItemsResponse.json() : [],
  };
}

export default async function AdminMenuPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="菜品管理需要登录" />;
  const data = await getData();

  return <MenuManagerClient initialCategories={data.categories} initialMenuItems={data.menuItems} />;
}
