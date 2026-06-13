import { KitchenTasksClient } from './tasks-client';
import { AuthRequired } from '../auth-required';
import { getAuthHeaders, hasAuthToken } from '../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getKitchenTasks() {
  const response = await fetch(`${apiBaseUrl}/api/kitchen/orders/tasks`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return [];
  return response.json();
}

export default async function KitchenPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="厨房屏需要登录" />;
  const tasks = await getKitchenTasks();

  return <KitchenTasksClient initialTasks={tasks} />;
}
