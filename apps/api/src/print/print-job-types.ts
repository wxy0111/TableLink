export const PRINT_JOB_TYPES = {
  kitchenOrder: 'kitchen_order',
  kitchenAddItem: 'kitchen_add_item',
  kitchenRefundItem: 'kitchen_refund_item',
  kitchenUrge: 'kitchen_urge',
  kitchenHold: 'kitchen_hold',
  kitchenResume: 'kitchen_resume',
  receiptPayment: 'receipt_payment',
  receiptRefund: 'receipt_refund',
  frontdeskOpenTable: 'frontdesk_open_table',
  frontdeskMoveTable: 'frontdesk_move_table',
  frontdeskMergeTable: 'frontdesk_merge_table',
  frontdeskClearTable: 'frontdesk_clear_table',
} as const;

export type PrintJobType = (typeof PRINT_JOB_TYPES)[keyof typeof PRINT_JOB_TYPES];
