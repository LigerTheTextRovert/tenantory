import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Notification } from './entities/notification.entity';
import { User } from '../auth/entities/user.entity';
import { NotificationController } from './notification.controller';
import { NotificationService } from './notification.service';
import { NotificationListener } from './notification.listener';
import { StockMovementNotificationListener } from './stock-movement-notification.listener';
import {
  NOTIFICATION_EVENT_EMITTER,
  NotificationEventEmitterAdapter,
} from './notification-event-emitter.port';

@Module({
  imports: [TypeOrmModule.forFeature([Notification, User])],
  controllers: [NotificationController],
  providers: [
    NotificationListener,
    StockMovementNotificationListener,
    NotificationEventEmitterAdapter,
    {
      provide: NOTIFICATION_EVENT_EMITTER,
      useExisting: NotificationEventEmitterAdapter,
    },
    NotificationService,
  ],
  exports: [NotificationService],
})
export class NotificationsModule {}
