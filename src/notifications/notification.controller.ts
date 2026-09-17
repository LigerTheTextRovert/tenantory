import {
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { NotificationService } from './notification.service';
import { NotificationQueryDto } from './dto/notification-query.dto';
import { PaginatedResponse } from '../common/interfaces/paginated-response.interface';
import { Notification } from './entities/notification.entity';

@ApiTags('Notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({
    summary: 'Retrieve the paginated notification feed for the current user',
  })
  @ApiQuery({
    name: 'page',
    required: false,
    type: Number,
    description: 'Page number (1-indexed)',
    example: 1,
  })
  @ApiQuery({
    name: 'limit',
    required: false,
    type: Number,
    description: 'Items per page (max 100)',
    example: 20,
  })
  @ApiQuery({
    name: 'unreadOnly',
    required: false,
    type: Boolean,
    description: 'Only return unread notifications',
  })
  @ApiQuery({
    name: 'type',
    required: false,
    enum: ['low_stock'],
    description: 'Filter by notification type',
  })
  @ApiQuery({
    name: 'startDate',
    required: false,
    type: String,
    description: 'ISO-8601 start date filter (inclusive)',
  })
  @ApiQuery({
    name: 'endDate',
    required: false,
    type: String,
    description: 'ISO-8601 end date filter (inclusive)',
  })
  @ApiResponse({ status: 200, description: 'Paginated notification feed' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 400, description: 'Invalid query parameters' })
  async findFeed(
    @TenantDecorator('id') tenantId: string,
    @CurrentUser('id') recipientId: string,
    @Query() query: NotificationQueryDto,
  ): Promise<PaginatedResponse<Notification>> {
    return this.notificationService.findFeed(tenantId, recipientId, query);
  }

  @Get('unread-count')
  @ApiOperation({
    summary: 'Get the unread notification count for the current user',
  })
  @ApiResponse({ status: 200, description: 'Unread notification count' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getUnreadCount(
    @TenantDecorator('id') tenantId: string,
    @CurrentUser('id') recipientId: string,
  ): Promise<{ unreadCount: number }> {
    const unreadCount = await this.notificationService.getUnreadCount(
      tenantId,
      recipientId,
    );
    return { unreadCount };
  }

  @Patch('read-all')
  @ApiOperation({
    summary: 'Mark all unread notifications as read for the current user',
  })
  @ApiResponse({
    status: 200,
    description: 'Number of notifications marked as read',
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async markAllRead(
    @TenantDecorator('id') tenantId: string,
    @CurrentUser('id') recipientId: string,
  ): Promise<{ updated: number }> {
    const updated = await this.notificationService.markAllRead(
      tenantId,
      recipientId,
    );
    return { updated };
  }

  @Patch(':id/read')
  @ApiOperation({ summary: 'Mark a single notification as read' })
  @ApiParam({ name: 'id', type: String, description: 'Notification UUID' })
  @ApiResponse({ status: 200, description: 'Notification marked as read' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @HttpCode(HttpStatus.OK)
  async markRead(
    @TenantDecorator('id') tenantId: string,
    @CurrentUser('id') recipientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<{ message: string }> {
    await this.notificationService.markRead(tenantId, recipientId, id);
    return { message: 'Notification marked as read' };
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Soft-delete a notification' })
  @ApiParam({ name: 'id', type: String, description: 'Notification UUID' })
  @ApiResponse({ status: 204, description: 'Notification deleted' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 404, description: 'Notification not found' })
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(
    @TenantDecorator('id') tenantId: string,
    @CurrentUser('id') recipientId: string,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<void> {
    return this.notificationService.remove(tenantId, recipientId, id);
  }
}
