import { cookies } from 'next/headers';

export async function getAuthHeaders(): Promise<Record<string, string>> {
  const token = (await cookies()).get('tablelink_token')?.value;
  return token ? { authorization: `Bearer ${token}` } : {};
}

export async function hasAuthToken() {
  return Boolean((await cookies()).get('tablelink_token')?.value);
}
