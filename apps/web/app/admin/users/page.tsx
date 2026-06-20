import { AuthRequired } from '../../auth-required';
import { getAuthHeaders, hasAuthToken } from '../../auth-session';
import { UsersManagerClient } from './users-manager-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getUsers() {
  const response = await fetch(`${apiBaseUrl}/api/admin/users`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return [];
  return response.json();
}

export default async function AdminUsersPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="员工管理需要登录" />;
  const users = await getUsers();

  return <UsersManagerClient initialUsers={users} />;
}
