# Troubleshooting

## Phones Cannot Open The Customer Page

Check:

- Phone is on the same Wi-Fi/LAN as the store PC.
- The URL uses the store PC LAN IP, not `localhost`.
- Windows Firewall allows Node.js or ports `3000` and `3001`.
- Web server window is still running.

Run:

```powershell
scripts\check-store.cmd
ipconfig
```

Use:

```txt
http://STORE_PC_IP:3000/table/TABLE-01
```

## Kitchen Or Cashier Page Cannot Open

Check:

- API window is running.
- Web window is running.
- Login account is active.
- Role has permission for the page.

Open health:

```txt
http://localhost:3001/api/system/health
```

## Database Cannot Connect

Symptoms:

- health shows `database = error`
- API window logs database connection errors

Fix:

- Confirm PostgreSQL is running.
- Confirm `DATABASE_URL` in `.env`.
- Run `npm.cmd run db:generate`.
- Run migrations if schema changed: `npm.cmd run db:migrate`.

## Port Is Already In Use

Symptoms:

- API or Web window fails with port bind error.

Fix:

- Close old terminal windows.
- Find the process using the port.
- Or change `API_PORT` / `WEB_PORT` in `.env`.

Default ports:

```txt
Web 3000
API 3001
```

## Print Page Has No Tasks

Check:

- New orders should create kitchen tickets.
- Payments should create receipt tickets.
- Refunds/voids should create corresponding tickets.
- `/print` is logged in with staff role.
- SSE is connected; if not, click manual refresh.

Health should show:

```txt
realtime = ok
```

## Login Failed Or Account Locked

Possible causes:

- Wrong phone number.
- Wrong PIN.
- User is inactive.
- Too many failed attempts.

Current rule:

- 5 failed attempts lock the phone/IP briefly.
- Successful login clears the failure count.

Owner/manager can reset PIN or reactivate users in `/admin/users`.

## Payment Intent Stays Pending

Pending online payment intents do not count as paid.

Options:

- If customer did not pay, close the intent.
- If this is a local mock trial and payment is confirmed, click mock success.
- Do not create manual payment and mark the same intent paid for the same money.

## Daily Closing Is Blocked

Open `/admin/daily-closing/check` through the page.

Common blockers:

- unpaid or partially paid order
- reopened order
- occupied/dining/paying table
- open shift
- failed print job

Resolve the listed item, refresh, then check again.

## Restore From Backup

Use `/admin/backups`.

Rules:

- Only owner/manager can restore.
- Restore requires explicit confirmation.
- Unsupported backup versions are rejected.
- Duplicate IDs or invalid collections are rejected.
- Restore writes an audit log.

Before restore:

- Export the current database as a backup if possible.
- Make sure the selected backup is the correct restaurant and date.

## Health Shows Storage Error

The API cannot write to:

```txt
data/uploads/menu
```

Fix:

- Confirm the folder exists or can be created.
- Confirm Windows permissions allow the current user to write.
- Avoid running the app from a read-only folder.
