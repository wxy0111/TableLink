import { ServiceTasksClient } from './service-tasks-client';
import { AuthRequired } from '../auth-required';
import { getAuthHeaders, hasAuthToken } from '../auth-session';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getServiceTasks() {
  const response = await fetch(`${apiBaseUrl}/api/service/tasks`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return { calls: [], readyItems: [] };
  return response.json();
}

export default async function ServicePage() {
  if (!(await hasAuthToken())) return <AuthRequired title="服务员面板需要登录" />;
  const tasks = await getServiceTasks();

  return <ServiceTasksClient initialTasks={tasks} />;
}
