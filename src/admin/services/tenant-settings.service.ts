import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import type { Repository } from 'typeorm';
import type { AuditService } from '../../audit/audit.service';
import { AuditAction } from '../../audit/enums/audit-action.enum';
import { AuditedEntityType } from '../../audit/enums/audited-entity-type';
import type { UpdateSettingsDto } from '../dto/update-settings.dto';
import { TenantSetting } from '../entities/tenant-setting.entity';

@Injectable()
export class TenantSettingService {
	constructor(
		@InjectRepository(TenantSetting)
		private readonly tenantSettingRepo: Repository<TenantSetting>,
		private readonly audit: AuditService,
	) {}

	async getSettings(tenantId: string): Promise<TenantSetting> {
		const settings = await this.tenantSettingRepo.findOne({
			where: { tenantId },
		});

		if (!settings) {
			throw new NotFoundException('Tenant settings not found');
		}

		return settings;
	}

	async updateSettings(
		tenantId: string,
		dto: UpdateSettingsDto,
	): Promise<TenantSetting> {
		const settings = await this.getSettings(tenantId);
		const oldConfig = settings.config;

		if (dto.config) {
			settings.config = {
				...settings.config,
				...dto.config,
			};
		}

		const saved = await this.tenantSettingRepo.save(settings);
		this.audit.record({
			action: AuditAction.UPDATE,
			entityType: AuditedEntityType.TENANT_SETTING,
			entityId: saved.id,
			oldValues: { config: oldConfig },
			newValues: { config: saved.config },
		});
		return saved;
	}
}
