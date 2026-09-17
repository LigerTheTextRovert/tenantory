export const NotificationType = {
  LOW_STOCK: 'low_stock',
} as const;

export type NotificationType =
  (typeof NotificationType)[keyof typeof NotificationType];
