import { TablesManagerClient } from './tables-manager-client';
import { AuthRequired } from '../../auth-required';
import { getAuthHeaders, hasAuthToken } from '../../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getTables() {
  const response = await fetch(`${apiBaseUrl}/api/admin/tables`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return [];
  return response.json();
}

export default async function AdminTablesPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="桌台二维码需要登录" />;
  const tables = await getTables();

  return <TablesManagerClient initialTables={tables} />;
}
