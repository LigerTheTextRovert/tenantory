import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';

import { TenantSettingService } from './tenant-settings.service';
import { TenantSetting } from '../entities/tenant-setting.entity';
import { UpdateSettingsDto } from '../dto/update-settings.dto';

describe('TenantSettingService', () => {
  let service: TenantSettingService;
  let tenantSettingRepo: {
    findOne: jest.Mock;
    save: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';

  beforeEach(async () => {
    tenantSettingRepo = {
      findOne: jest.fn(),
      save: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantSettingService,
        {
          provide: getRepositoryToken(TenantSetting),
          useValue: tenantSettingRepo,
        },
      ],
    }).compile();

    service = module.get<TenantSettingService>(TenantSettingService);
    jest.clearAllMocks();
  });

  describe('getSettings', () => {
    it('should return settings when found', async () => {
      const settings = {
        tenantId: TENANT_ID,
        config: { theme: 'dark' },
      } as unknown as TenantSetting;
      tenantSettingRepo.findOne.mockResolvedValue(settings);

      const result = await service.getSettings(TENANT_ID);

      expect(tenantSettingRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
      expect(result).toBe(settings);
    });

    it('should throw NotFoundException when settings not found', async () => {
      tenantSettingRepo.findOne.mockResolvedValue(null);

      await expect(service.getSettings(TENANT_ID)).rejects.toThrow(
        new NotFoundException('Tenant settings not found'),
      );
    });
  });

  describe('updateSettings', () => {
    it('should update and save settings successfully', async () => {
      const existingSettings = {
        tenantId: TENANT_ID,
        config: { theme: 'light', timezone: 'UTC' },
      } as unknown as TenantSetting;

      tenantSettingRepo.findOne.mockResolvedValue(existingSettings);
      tenantSettingRepo.save.mockImplementation((s) => Promise.resolve(s));

      const dto: UpdateSettingsDto = {
        config: { theme: 'dark' },
      };

      const result = await service.updateSettings(TENANT_ID, dto);

      expect(tenantSettingRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID },
      });
      expect(tenantSettingRepo.save).toHaveBeenCalled();
      expect(result.config).toEqual({ theme: 'dark', timezone: 'UTC' });
    });

    it('should not mutate config if config is not provided in dto', async () => {
      const existingSettings = {
        tenantId: TENANT_ID,
        config: { theme: 'light' },
      } as unknown as TenantSetting;

      tenantSettingRepo.findOne.mockResolvedValue(existingSettings);
      tenantSettingRepo.save.mockImplementation((s) => Promise.resolve(s));

      const dto: UpdateSettingsDto = {};

      const result = await service.updateSettings(TENANT_ID, dto);

      expect(result.config).toEqual({ theme: 'light' });
      expect(tenantSettingRepo.save).toHaveBeenCalledWith(existingSettings);
    });
  });
});
