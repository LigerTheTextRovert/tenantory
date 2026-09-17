import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateNotificationsTable1789656931723 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE notifications (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        tenant_id UUID NOT NULL,
        recipient_id UUID NOT NULL,
        type VARCHAR(50) NOT NULL,
        title VARCHAR(200) NOT NULL,
        body VARCHAR(1000),
        data JSONB,
        dedup_key VARCHAR(200),
        read_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMPTZ,
        CONSTRAINT fk_notifications_tenant FOREIGN KEY (tenant_id)
          REFERENCES tenants (id) ON DELETE CASCADE,
        CONSTRAINT fk_notifications_recipient FOREIGN KEY (recipient_id)
          REFERENCES users (id) ON DELETE CASCADE
      );
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notifications_tenant_recipient_created
        ON notifications (tenant_id, recipient_id, created_at DESC);
    `);

    await queryRunner.query(`
      CREATE INDEX idx_notifications_tenant_recipient_unread
        ON notifications (tenant_id, recipient_id)
        WHERE read_at IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_notifications_tenant_recipient_unread;',
    );
    await queryRunner.query(
      'DROP INDEX IF EXISTS idx_notifications_tenant_recipient_created;',
    );
    await queryRunner.query('DROP TABLE IF EXISTS notifications;');
  }
}
