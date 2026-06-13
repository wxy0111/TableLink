import { SetupClient } from './setup-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getStatus() {
  const response = await fetch(`${apiBaseUrl}/api/setup/status`, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

export default async function SetupPage() {
  const status = await getStatus();

  return <SetupClient initialStatus={status} />;
}

