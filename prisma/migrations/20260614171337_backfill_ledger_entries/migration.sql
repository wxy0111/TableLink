-- Backfill item sales from existing order item snapshots.
INSERT INTO "ledger_entries" (
    "id",
    "restaurant_id",
    "table_id",
    "order_id",
    "order_item_id",
    "entry_type",
    "amount",
    "source_id",
    "note",
    "metadata",
    "occurred_at",
    "created_at"
)
SELECT
    'ledger-item-sale-' || oi."id",
    o."restaurant_id",
    o."table_id",
    o."id",
    oi."id",
    'item_sale'::"LedgerEntryType",
    oi."price_snapshot" * oi."quantity",
    oi."id",
    '历史菜品销售回填',
    jsonb_build_object('orderNo', o."order_no", 'itemName', oi."name_snapshot"),
    oi."created_at",
    oi."created_at"
FROM "order_items" oi
JOIN "orders" o ON o."id" = oi."order_id"
WHERE oi."status" <> 'cancelled'
ON CONFLICT ("entry_type", "source_id") DO NOTHING;

-- Backfill item voids from already-refunded order items.
INSERT INTO "ledger_entries" (
    "id",
    "restaurant_id",
    "table_id",
    "order_id",
    "order_item_id",
    "entry_type",
    "amount",
    "source_id",
    "note",
    "metadata",
    "occurred_at",
    "created_at"
)
SELECT
    'ledger-item-void-' || oi."id",
    o."restaurant_id",
    o."table_id",
    o."id",
    oi."id",
    'item_void'::"LedgerEntryType",
    oi."price_snapshot" * oi."quantity",
    oi."id",
    '历史退菜回填',
    jsonb_build_object('orderNo', o."order_no", 'itemName', oi."name_snapshot"),
    oi."updated_at",
    oi."updated_at"
FROM "order_items" oi
JOIN "orders" o ON o."id" = oi."order_id"
WHERE oi."status" = 'refunded'
ON CONFLICT ("entry_type", "source_id") DO NOTHING;

-- Backfill received and refunded payments.
INSERT INTO "ledger_entries" (
    "id",
    "restaurant_id",
    "table_id",
    "order_id",
    "payment_id",
    "entry_type",
    "amount",
    "source_id",
    "note",
    "metadata",
    "occurred_at",
    "created_at"
)
SELECT
    'ledger-payment-' || p."status" || '-' || p."id",
    o."restaurant_id",
    o."table_id",
    o."id",
    p."id",
    CASE
      WHEN p."status" = 'paid' THEN 'payment_received'::"LedgerEntryType"
      ELSE 'payment_refund'::"LedgerEntryType"
    END,
    p."amount",
    p."id",
    CASE
      WHEN p."status" = 'paid' THEN '历史收款回填'
      ELSE '历史退款回填'
    END,
    jsonb_build_object('orderNo', o."order_no", 'method', p."method"),
    COALESCE(p."paid_at", p."created_at"),
    p."created_at"
FROM "payments" p
JOIN "orders" o ON o."id" = p."order_id"
WHERE p."status" IN ('paid', 'refunded')
ON CONFLICT ("entry_type", "source_id") DO NOTHING;
