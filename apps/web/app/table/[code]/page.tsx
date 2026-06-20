import { MenuOrderClient } from './menu-order-client';

const apiBaseUrl = process.env.INTERNAL_API_BASE_URL ?? 'http://localhost:3001';

async function getTable(code: string) {
  const response = await fetch(`${apiBaseUrl}/api/public/tables/${code}`, { cache: 'no-store' });
  if (!response.ok) return null;
  return response.json();
}

async function getMenu(restaurantId: string) {
  const response = await fetch(`${apiBaseUrl}/api/public/restaurants/${restaurantId}/menu`, { cache: 'no-store' });
  if (!response.ok) return [];
  return response.json();
}

export default async function TableMenuPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const table = await getTable(code);
  const menu = table ? await getMenu(table.restaurantId) : [];

  return (
    <main className="shell">
      <header className="topbar">
        <div className="brand">系岛食堂</div>
        <span className="pill">{table ? `${table.name} 桌` : '桌台未找到'}</span>
      </header>

      {table ? <MenuOrderClient tableCode={code} restaurantId={table.restaurantId} categories={menu} /> : null}
    </main>
  );
}
