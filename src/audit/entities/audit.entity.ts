import {
	Column,
	CreateDateColumn,
	Entity,
	Index,
	JoinColumn,
	ManyToOne,
	PrimaryGeneratedColumn,
	type Relation,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { AuditAction } from '../enums/audit-action.enum';
import type { AuditedEntityType } from '../enums/audited-entity-type';
import type { AuditMetadata } from '../events/audit.event';

@Entity('audit_logs')
@Index('idx_audit_logs_tenant_created_at', ['tenantId', 'createdAt'])
@Index('idx_audit_logs_entity', ['entityType', 'entityId'])
@Index('idx_audit_logs_actor_id', ['actorId'])
export class Audit {
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@Column({ type: 'uuid', name: 'tenant_id' })
	tenantId: string;

	@ManyToOne(() => Tenant, { onDelete: 'CASCADE' })
	@JoinColumn({ name: 'tenant_id' })
	tenant: Relation<Tenant>;

	@Column({ type: 'uuid', name: 'actor_id', nullable: true })
	actorId: string | null;

	@ManyToOne(() => User, { onDelete: 'SET NULL' })
	@JoinColumn({ name: 'actor_id' })
	actor: Relation<User>;

	@Column({ type: 'enum', enum: AuditAction })
	action: AuditAction;

	@Column({ type: 'varchar', length: 50, name: 'entity_type' })
	entityType: AuditedEntityType;

	@Column({ type: 'uuid', name: 'entity_id' })
	entityId: string;

	@Column({ type: 'jsonb', name: 'old_values', nullable: true, default: null })
	oldValues: Record<string, unknown> | null;

	@Column({ type: 'jsonb', name: 'new_values', nullable: true, default: null })
	newValues: Record<string, unknown> | null;

	@Column({ type: 'jsonb', name: 'metadata', nullable: true, default: null })
	metadata: AuditMetadata | null;

	@CreateDateColumn({
		type: 'timestamp with time zone',
		name: 'created_at',
		default: () => 'CURRENT_TIMESTAMP',
	})
	createdAt: Date;
}
