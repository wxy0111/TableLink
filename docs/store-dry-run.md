# Store Dry Run

This dry run simulates one real restaurant business day before trial operation. It is not a new feature plan; it is a product acceptance rehearsal.

## Goals

- Confirm staff can understand the pages and error messages.
- Confirm kitchen, service, cashier, print, admin, and daily closing update reliably.
- Confirm money, ledger, reports, and payment status match.
- Confirm customer phone pages are usable.
- Find small blockers before a real store shift.

## People And Devices

- Owner/manager: store PC or admin laptop.
- Cashier: cashier PC or tablet.
- Kitchen: kitchen tablet/screen.
- Waiter: phone or tablet.
- Customer A and B: two phones on store Wi-Fi.

## Before The Run

1. Start the system with `scripts\start-store.cmd`.
2. Run `scripts\check-store.cmd`.
3. Confirm `GET /api/system/health` reports:
   - `api = ok`
   - `database = ok`
   - `realtime = ok`
   - `storage = ok`
4. Confirm the phone can open `http://STORE_PC_IP:3000`.
5. Confirm staff can log in.
6. Keep `/print`, `/kitchen`, `/service`, `/staff`, `/admin`, and `/admin/daily-closing` open.

## Full-Day Rehearsal

1. Store manager starts the system.
2. Manager checks health and LAN addresses.
3. Manager creates or confirms staff accounts in `/admin/users`.
4. Manager confirms restaurant setup and business day start time in `/setup`.
5. Cashier opens a shift in `/staff`.
6. Manager opens `/admin/tables` and prints or checks table QR codes.
7. Customer A scans table A and places an order.
8. Customer B scans table B, places an order, and calls a waiter.
9. Kitchen starts cooking and marks items ready.
10. Waiter confirms service call and marks items served.
11. Cashier adds an item to table A.
12. Cashier or manager marks one menu item sold out.
13. Customer B attempts to order the sold-out item and sees a clear rejection.
14. Cashier refunds one item from table A with a reason.
15. Cashier applies rounding or discount to table B with a reason.
16. Cashier creates a WeChat mock payment intent for table A and marks it paid.
17. Cashier records cash payment for table B.
18. Manager reopens table A order, adds a service charge, and records the extra payment.
19. Staff marks one print job failed, confirms it appears as failed, then retries it.
20. Cashier clears both tables.
21. Manager checks `/admin` operating metrics:
    - net sales
    - net paid
    - unpaid amount
    - order count
    - table turnover
    - average order amount
    - top items
    - void reasons
    - payment methods
    - peak hours
    - kitchen efficiency
22. Manager opens `/admin/daily-closing` and checks blockers.
23. Cashier closes the shift if this was a rehearsal-only shift.
24. Manager exports a backup from `/admin/backups`.
25. Restart API/Web and confirm orders, payments, reports, and backup page still show data.

## API Verification Script

Run after API is started:

```powershell
npm.cmd run verify:store-dry-run
```

The script validates the API-level flow:

- health check
- owner/cashier/kitchen/waiter login
- open or reuse shift
- create temporary dry-run tables
- customer orders
- service call
- kitchen start and ready
- waiter served
- cashier add item
- sold-out rejection
- item refund
- discount
- mock online payment intent and mark-paid
- cash payment
- reopen paid order
- service charge and extra collection
- print failed and retry
- clear tables
- daily closing check
- backup export
- close only the shift opened by the script

## What To Watch Manually

- Do kitchen/service/staff/admin pages refresh without manual refresh?
- Do staff understand disabled buttons and error messages?
- Does the customer page feel clear on a small phone?
- Does the print page make failed/retry status obvious?
- Are daily closing blockers specific enough to act on?
- Do report numbers match what the cashier expects?

## Findings Template

Use this format during the dry run:

```txt
Time:
Role:
Page:
Action:
Expected:
Actual:
Severity: blocker / important / polish
Decision: fix now / later
```

## Known Follow-Ups To Consider Later

- Better guided UI for first-time cashier training.
- Real printer driver integration.
- Real WeChat/Alipay gateway integration.
- Optional Excel export for accountant workflows.
- More visual charts after trial feedback.
