import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { TenantSetting } from '../entities/tenant-setting.entity';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

@Injectable()
export class TenantSettingService {
  constructor(
    @InjectRepository(TenantSetting)
    private readonly tenantSettingRepo: Repository<TenantSetting>,
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

    if (dto.config) {
      settings.config = {
        ...settings.config,
        ...dto.config,
      };
    }

    return await this.tenantSettingRepo.save(settings);
  }
}
