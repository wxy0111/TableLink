import { StaffDashboardClient } from './staff-dashboard-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getTables() {
  const response = await fetch(`${apiBaseUrl}/api/staff/tables`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function StaffPage() {
  const tables = await getTables();

  return <StaffDashboardClient initialTables={tables} />;
}
