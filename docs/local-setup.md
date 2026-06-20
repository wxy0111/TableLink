# TableLink Local Setup

This guide is for running TableLink on one Windows PC inside a restaurant LAN.

## 1. Prepare The PC

Required:

- Windows 10/11
- Node.js 24 or newer
- npm
- PostgreSQL database, either local Docker Compose or an existing PostgreSQL server
- A stable LAN connection

Recommended:

- Keep the store PC on wired Ethernet if possible.
- Disable sleep while the restaurant is open.
- Make sure Windows Firewall allows Node.js or ports `3000` and `3001`.

## 2. Environment File

From the project root:

```powershell
copy .env.example .env
```

Edit `.env`:

```txt
DATABASE_URL="postgresql://order_user:order_password@localhost:5432/order_system?schema=public"
API_PORT=3001
WEB_PORT=3000
API_PROXY_TARGET="http://localhost:3001"
PUBLIC_WEB_BASE_URL="http://localhost:3000"
AUTH_SECRET="change-this-local-secret"
```

For real LAN use, set `PUBLIC_WEB_BASE_URL` to the store PC LAN address, for example:

```txt
PUBLIC_WEB_BASE_URL="http://192.168.1.20:3000"
```

Do not paste secrets into screenshots or chat groups.

## 3. Install And Initialize

```powershell
npm.cmd install
npm.cmd run db:generate
npm.cmd run db:migrate
npm.cmd run db:seed
```

The seed creates hashed PIN accounts. It does not store `pin:1111` plain PIN values.

Default seed logins:

```txt
Owner    13800000000 / 1111
Kitchen  13800000001 / 2222
Cashier  13800000002 / 3333
Waiter   13800000003 / 4444
Manager  13800000004 / 5555
```

After first login, use `/admin/users` to create real staff accounts and replace demo PINs.

## 4. Start The Store

Recommended:

```powershell
scripts\start-store.cmd
```

This script:

- checks `.env`
- runs Prisma generate
- asks whether to run migrations
- starts API and Web in separate windows
- prints common page URLs
- prints LAN IPv4 addresses

Manual startup:

```powershell
scripts\start-api.cmd
scripts\start-web.cmd
```

## 5. Check Health

After API and Web start:

```powershell
scripts\check-store.cmd
```

Or open:

```txt
http://localhost:3001/api/system/health
```

Expected healthy response:

```json
{
  "api": "ok",
  "database": "ok",
  "realtime": "ok",
  "storage": "ok",
  "version": "0.0.0-local",
  "checkedAt": "2026-06-18T00:00:00.000Z"
}
```

If `api` is `degraded`, check the `errors` array.

## 6. Common Pages

```txt
Home           http://localhost:3000
Login          http://localhost:3000/login
Table sample   http://localhost:3000/table/TABLE-01
Kitchen        http://localhost:3000/kitchen
Service        http://localhost:3000/service
Staff          http://localhost:3000/staff
Print jobs     http://localhost:3000/print
Admin          http://localhost:3000/admin
Daily closing  http://localhost:3000/admin/daily-closing
Menu admin     http://localhost:3000/admin/menu
Tables admin   http://localhost:3000/admin/tables
Users admin    http://localhost:3000/admin/users
Backups        http://localhost:3000/admin/backups
Setup          http://localhost:3000/setup
```

For phones and tablets, replace `localhost` with the store PC LAN IP.

## 7. Final Store Configuration

Before trial operation:

- Open `/setup` and confirm restaurant name and business day start time.
- Open `/admin/users` and create real owner, manager, cashier, waiter, and kitchen users.
- Open `/admin/tables` and confirm table QR codes.
- Open `/admin/menu` and confirm categories, menu items, sold-out state, and options.
- Open `/staff` and open a shift.
- Export one backup from `/admin/backups`.

## 8. Local Verification Commands

For developers or technical operators:

```powershell
npm.cmd run test
npm.cmd run typecheck
npm.cmd run lint
npm.cmd run build -w apps/api
npm.cmd run build -w apps/web
```
