import { ServiceTasksClient } from './service-tasks-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getServiceTasks() {
  const response = await fetch(`${apiBaseUrl}/api/service/tasks`, { cache: 'no-store' });
  if (!response.ok) return { calls: [], readyItems: [] };
  return response.json();
}

export default async function ServicePage() {
  const tasks = await getServiceTasks();

  return <ServiceTasksClient initialTasks={tasks} />;
}

