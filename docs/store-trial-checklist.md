# Store Trial Checklist

Use this checklist before and during a restaurant trial day.

## Before Opening

- Store PC is powered on, plugged in, and sleep mode is disabled.
- PC is connected to the same LAN/Wi-Fi as staff tablets and customer phones.
- `.env` exists and `PUBLIC_WEB_BASE_URL` points to the store PC LAN IP.
- Run `scripts\start-store.cmd`.
- Run `scripts\check-store.cmd`.
- Confirm health:
  - `api = ok`
  - `database = ok`
  - `realtime = ok`
  - `storage = ok`
- Windows Firewall allows Node.js or ports `3000` and `3001`.

## LAN Access

- On the store PC, open `http://localhost:3000`.
- On a phone using store Wi-Fi, open `http://STORE_PC_IP:3000`.
- On a kitchen or cashier tablet, open the needed staff page.

## Initial Data

- Open `/setup` and confirm restaurant name and business day start time.
- Open `/admin/users`:
  - create real staff accounts
  - confirm at least one active owner
  - reset any demo PINs
- Open `/admin/tables`:
  - confirm all tables exist
  - print or display QR codes
  - regenerate leaked or wrong table codes
- Open `/admin/menu`:
  - confirm active/inactive/sold-out states
  - confirm item options such as size, spice level, and add-ons

## Opening Shift

- Login as owner, manager, or cashier.
- Open `/staff`.
- Open the current shift.
- Confirm current tables are idle before customers arrive.

## Customer Order Flow

- Scan one table QR code.
- Add menu items, including one item with options.
- Submit the order.
- Confirm `/kitchen` updates automatically.
- Confirm `/print` shows the kitchen ticket.

## Kitchen And Service Flow

- On `/kitchen`, start cooking.
- Mark item ready.
- Confirm `/service` updates automatically.
- On `/service`, mark served.
- Confirm `/staff` table/order status is correct.

## Cashier Flow

- On `/staff`, open the table order.
- Add item if needed, including options.
- Test sold-out item blocking if needed.
- Apply discount, rounding, comp, or service charge only when needed.
- Create manual payment or mock online payment intent.
- Mark online intent paid only after simulated confirmation.
- Print receipt from `/print`.
- Clear table only after payment is complete.

## Reopen And Refund Flow

- Only owner or manager may reopen a paid order.
- Reopen requires a reason.
- Original payment and ledger records must remain.
- Use refund or additional payment after reopening.
- Confirm reopened orders block table clearing and daily closing until resolved.

## Daily Closing

- Open `/admin/daily-closing`.
- Confirm:
  - unpaid orders
  - open tables
  - open shift
  - failed or pending print jobs
- Resolve blockers.
- Confirm business day range is correct.
- Review:
  - gross sales
  - voids
  - discounts
  - adjustments/service charges
  - net sales
  - net paid
  - refunds
  - payment methods
  - table turnover
  - average order amount
  - top items
  - peak hours
  - kitchen efficiency

## Backup

- Open `/admin/backups`.
- Export a backup after closing.
- Keep the `.json` backup outside the store PC if possible.
- Confirm the backup metadata includes counts for orders, payments, ledger entries, shifts, print jobs, and audit logs.

## Incident Notes

- If phones cannot access the site, check LAN IP and firewall.
- If login is locked, wait for the lock window or use another owner/manager account.
- If a payment intent remains pending, close it or mark it paid only after confirmation.
- If daily closing is blocked, resolve the listed unpaid orders, open tables, open shift, or failed print jobs.
- If data is damaged, restore from `/admin/backups` using `confirmRestore`.
