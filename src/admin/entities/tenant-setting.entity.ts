import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	OneToOne,
	PrimaryGeneratedColumn,
	UpdateDateColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';

@Entity('tenant_settings')
@Index('idx_tenant_settings_tenant_id', ['tenantId'], { unique: true })
export class TenantSetting {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'uuid', name: 'tenant_id' })
	tenantId: string;

	@OneToOne(() => Tenant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Tenant;

	@Column({ type: 'jsonb', default: {} })
	config: Record<string, unknown>;

	@CreateDateColumn({ type: 'timestamp', name: 'created_at' })
	createdAt: Date;

	@UpdateDateColumn({ type: 'timestamp', name: 'updated_at' })
	updatedAt: Date;
}
