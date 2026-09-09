import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  ConflictException,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';

import * as bcrypt from 'bcryptjs';

import { TenantUserManagementService } from './tenant-user-management.service';
import { AuditService } from '../../audit/audit.service';
import { User } from '../../auth/entities/user.entity';
import { UserRole } from '../../auth/enum/user-role.enum';
import { CacheService } from '../../common/services/cache.service';
import { CacheKeys } from '../../common/constants/cache.constants';

jest.mock('bcryptjs');

describe('TenantUserManagementService', () => {
  let service: TenantUserManagementService;
  let userRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
  };
  let cache: {
    del: jest.Mock;
  };

  const TENANT_ID = 't1234567-e5f6-7890-abcd-ef1234567890';
  const USER_ID = 'u1234567-e5f6-7890-abcd-ef1234567890';
  const EMAIL = 'user@tenant.com';

  beforeEach(async () => {
    userRepo = {
      findOne: jest.fn(),
      create: jest.fn(),
      save: jest.fn(),
    };

    cache = {
      del: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TenantUserManagementService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: CacheService, useValue: cache },
        { provide: AuditService, useValue: { record: jest.fn() } },
      ],
    }).compile();

    service = module.get<TenantUserManagementService>(
      TenantUserManagementService,
    );
    jest.clearAllMocks();
  });

  describe('inviteUser', () => {
    const dto = {
      email: EMAIL,
      password: 'password123',
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.CUSTOMER,
    };

    it('should invite and save user successfully', async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue('hashed_password');

      const mockUser = { id: USER_ID, ...dto } as unknown as User;
      userRepo.create.mockReturnValue(mockUser);
      userRepo.save.mockResolvedValue(mockUser);

      const result = await service.inviteUser(TENANT_ID, dto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { email: EMAIL, tenantId: TENANT_ID },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(dto.password, 12);
      expect(userRepo.create).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        email: EMAIL,
        firstName: dto.firstName,
        lastName: dto.lastName,
        passwordHash: 'hashed_password',
        role: dto.role,
        isActive: true,
      });
      expect(userRepo.save).toHaveBeenCalledWith(mockUser);
      expect(result).toBe(mockUser);
    });

    it('should throw BadRequestException if user already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: USER_ID });

      await expect(service.inviteUser(TENANT_ID, dto)).rejects.toThrow(
        new BadRequestException(
          'User with this email already exists in this tenant',
        ),
      );
    });

    it('should throw BadRequestException if inviting as Super Admin', async () => {
      userRepo.findOne.mockResolvedValue(null);
      const superAdminDto = { ...dto, role: UserRole.SUPER_ADMIN };

      await expect(
        service.inviteUser(TENANT_ID, superAdminDto),
      ).rejects.toThrow(
        new BadRequestException('Cannot invite a user as Super Admin'),
      );
    });

    it('should throw ConflictException on unique violation during save', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockReturnValue({});
      userRepo.save.mockRejectedValue(
        Object.assign(new Error('duplicate key'), { code: '23505' }),
      );

      await expect(service.inviteUser(TENANT_ID, dto)).rejects.toThrow(
        new ConflictException(
          'A user with this unique identifier already exists',
        ),
      );
    });

    it('should throw InternalServerErrorException on general db error during save', async () => {
      userRepo.findOne.mockResolvedValue(null);
      userRepo.create.mockReturnValue({});
      userRepo.save.mockRejectedValue(new Error('DB error'));

      await expect(service.inviteUser(TENANT_ID, dto)).rejects.toThrow(
        new InternalServerErrorException(
          'An error occurred during user invitation',
        ),
      );
    });
  });

  describe('updateUserRole', () => {
    it('should update role and invalidate user cache', async () => {
      const existingUser = {
        id: USER_ID,
        tenantId: TENANT_ID,
        role: UserRole.CUSTOMER,
      } as unknown as User;

      userRepo.findOne.mockResolvedValue(existingUser);
      userRepo.save.mockImplementation((u) => Promise.resolve(u));

      const dto = { role: UserRole.TENANT_ADMIN };

      const result = await service.updateUserRole(TENANT_ID, USER_ID, dto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID, tenantId: TENANT_ID },
      });
      expect(existingUser.role).toBe(UserRole.TENANT_ADMIN);
      expect(userRepo.save).toHaveBeenCalledWith(existingUser);
      expect(cache.del).toHaveBeenCalledWith(
        CacheKeys.user(TENANT_ID, USER_ID),
      );
      expect(result).toBe(existingUser);
    });

    it('should throw NotFoundException if user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateUserRole(TENANT_ID, USER_ID, {
          role: UserRole.TENANT_ADMIN,
        }),
      ).rejects.toThrow(new NotFoundException('User not found in this tenant'));
    });

    it('should throw BadRequestException when trying to assign Super Admin role', async () => {
      const user = { id: USER_ID, role: UserRole.CUSTOMER } as unknown as User;
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.updateUserRole(TENANT_ID, USER_ID, {
          role: UserRole.SUPER_ADMIN,
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot assign or modify Super Admin role'),
      );
    });

    it('should throw BadRequestException when trying to modify Super Admin user', async () => {
      const user = {
        id: USER_ID,
        role: UserRole.SUPER_ADMIN,
      } as unknown as User;
      userRepo.findOne.mockResolvedValue(user);

      await expect(
        service.updateUserRole(TENANT_ID, USER_ID, {
          role: UserRole.TENANT_ADMIN,
        }),
      ).rejects.toThrow(
        new BadRequestException('Cannot assign or modify Super Admin role'),
      );
    });

    it('should throw InternalServerErrorException if save fails', async () => {
      const user = { id: USER_ID, role: UserRole.CUSTOMER } as unknown as User;
      userRepo.findOne.mockResolvedValue(user);
      userRepo.save.mockRejectedValue(new Error('Write failed'));

      await expect(
        service.updateUserRole(TENANT_ID, USER_ID, {
          role: UserRole.TENANT_ADMIN,
        }),
      ).rejects.toThrow(
        new InternalServerErrorException('Failed to update user role'),
      );
    });
  });
});
