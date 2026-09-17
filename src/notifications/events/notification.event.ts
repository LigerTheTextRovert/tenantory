import { UserRole } from '../../auth/enum/user-role.enum';
import { NotificationType } from '../enums/notification-type';

export const NOTIFICATION_DISPATCH_EVENT = 'notification.dispatch';

export interface NotificationDispatchInput {
  tenantId: string;
  /** Explicit recipient user IDs. */
  recipientIds?: string[];
  /** Fan-out targets resolved to active users of the tenant at dispatch time. */
  recipientRoles?: UserRole[];
  type: NotificationType;
  title: string;
  body?: string | null;
  /** Client-facing structured payload (entity refs, deep links). */
  data?: Record<string, unknown> | null;
  /** When set, users with an existing unread notification of the same type + key are skipped. */
  dedupKey?: string | null;
}

export interface NotificationDispatchEvent {
  tenantId: string;
  recipientIds: string[];
  recipientRoles: UserRole[];
  type: NotificationType;
  title: string;
  body: string | null;
  data: Record<string, unknown> | null;
  dedupKey: string | null;
}
