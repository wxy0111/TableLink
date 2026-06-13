import { KitchenTasksClient } from './tasks-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getKitchenTasks() {
  const response = await fetch(`${apiBaseUrl}/api/kitchen/orders/tasks`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function KitchenPage() {
  const tasks = await getKitchenTasks();

  return <KitchenTasksClient initialTasks={tasks} />;
}

