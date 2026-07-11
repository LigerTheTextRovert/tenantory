import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

export enum TenantStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  ARCHIVED = 'archived',
}

@Entity('tenant')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'domain_name' })
  domainName: string;

  @Column({ name: 'business_name' })
  businessName: string;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.PENDING })
  status: TenantStatus;

  @Column({ name: 'created_at' })
  createdAt: Date;

  @Column({ name: 'updated_at' })
  updatedAt: Date;
}
