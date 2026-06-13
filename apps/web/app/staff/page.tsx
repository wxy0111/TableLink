import { StaffDashboardClient } from './staff-dashboard-client';
import { AuthRequired } from '../auth-required';
import { getAuthHeaders, hasAuthToken } from '../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getTables() {
  const response = await fetch(`${apiBaseUrl}/api/staff/tables`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return [];
  return response.json();
}

async function getMenuItems() {
  const response = await fetch(`${apiBaseUrl}/api/public/restaurants/seed-restaurant-xidao/menu`, { cache: 'no-store' });
  if (!response.ok) return [];
  const categories = await response.json();
  return categories.flatMap((category: { menuItems: unknown[] }) => category.menuItems);
}

export default async function StaffPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="收银台需要登录" />;
  const [tables, menuItems] = await Promise.all([getTables(), getMenuItems()]);

  return <StaffDashboardClient initialTables={tables} initialMenuItems={menuItems} />;
}
