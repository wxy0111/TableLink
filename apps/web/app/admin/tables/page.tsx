import { TablesManagerClient } from './tables-manager-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getTables() {
  const response = await fetch(`${apiBaseUrl}/api/admin/tables`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function AdminTablesPage() {
  const tables = await getTables();

  return <TablesManagerClient initialTables={tables} />;
}

