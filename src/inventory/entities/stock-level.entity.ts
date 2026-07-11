import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { Tenant } from '../../tenant/entities/tenant.entity';
import { ProductVariant } from '../../catalog/entities/product-variant.entity';
import { Warehouse } from '../../warehouse/entities/warehouse.entity';

@Entity('stock_levels')
@Unique(['variant', 'warehouse'])
export class StockLevel {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('idx_stock_levels_tenant_id')
  @Column({ name: 'tenant_id', type: 'uuid' })
  tenantId: string;

  @ManyToOne(() => Tenant, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'tenant_id' })
  tenant: Tenant;

  @ManyToOne(() => ProductVariant, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'variant_id' })
  variant: ProductVariant;

  @ManyToOne(() => Warehouse, {
    nullable: false,
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse: Warehouse;

  @Column({ name: 'available_quantity', type: 'int', default: 0 })
  availableQuantity: number;

  @Column({ name: 'reserved_quantity', type: 'int', default: 0 })
  reservedQuantity: number;

  @Column({ name: 'safety_threshold', type: 'int', default: 0 })
  safetyThreshold: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
