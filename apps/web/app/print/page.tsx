import { AuthRequired } from '../auth-required';
import { getAuthHeaders, hasAuthToken } from '../auth-session';
import { PrintClient } from './print-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getPrintJobs() {
  const response = await fetch(`${apiBaseUrl}/api/staff/print-jobs`, { cache: 'no-store', headers: await getAuthHeaders() });
  if (!response.ok) return [];
  return response.json();
}

export default async function PrintPage() {
  if (!(await hasAuthToken())) return <AuthRequired title="Print jobs need login" />;
  const jobs = await getPrintJobs();
  return <PrintClient initialJobs={jobs} />;
}
