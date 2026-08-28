import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { IsNull } from 'typeorm';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';

import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { UserRole } from './enum/user-role.enum';
import { CacheService } from '../common/services/cache.service';
import { CacheKeys, CACHE_TTL } from '../common/constants/cache.constants';

jest.mock('bcryptjs');

describe('AuthService', () => {
  let service: AuthService;
  let userRepo: {
    create: jest.Mock;
    save: jest.Mock;
    findOne: jest.Mock;
  };
  let configService: {
    get: jest.Mock;
  };
  let jwtService: {
    signAsync: jest.Mock;
    verifyAsync: jest.Mock;
  };
  let cache: {
    get: jest.Mock;
    set: jest.Mock;
  };

  const TENANT_ID = '550e8400-e29b-41d4-a716-446655440000';
  const USER_ID = 'a1b2c3d4-e5f6-7890-abcd-ef1234567890';
  const EMAIL = 'user@example.com';
  const PASSWORD = 'password123';
  const PASSWORD_HASH = 'hashed_password_123';

  beforeEach(async () => {
    userRepo = {
      create: jest.fn(),
      save: jest.fn(),
      findOne: jest.fn(),
    };

    configService = {
      get: jest.fn().mockImplementation((key: string) => {
        if (key === 'JWT_ACCESS_SECRET') return 'access_secret';
        if (key === 'JWT_REFRESH_SECRET') return 'refresh_secret';
        return null;
      }),
    };

    jwtService = {
      signAsync: jest.fn().mockResolvedValue('token_val'),
      verifyAsync: jest.fn(),
    };

    cache = {
      get: jest.fn().mockResolvedValue(null),
      set: jest.fn().mockResolvedValue(undefined),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: ConfigService, useValue: configService },
        { provide: JwtService, useValue: jwtService },
        { provide: CacheService, useValue: cache },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jest.clearAllMocks();
  });

  describe('register', () => {
    const registerDto = {
      email: EMAIL,
      password: PASSWORD,
      firstName: 'John',
      lastName: 'Doe',
      role: UserRole.CUSTOMER,
    };

    it('should register a new user successfully', async () => {
      userRepo.findOne.mockResolvedValue(null);
      (bcrypt.hash as jest.Mock).mockResolvedValue(PASSWORD_HASH);

      const createdUser = {
        id: USER_ID,
        tenantId: TENANT_ID,
        email: EMAIL,
        passwordHash: PASSWORD_HASH,
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.CUSTOMER,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      userRepo.create.mockReturnValue(createdUser);
      userRepo.save.mockResolvedValue(createdUser);

      const result = await service.register(TENANT_ID, registerDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, email: EMAIL },
      });
      expect(bcrypt.hash).toHaveBeenCalledWith(PASSWORD, 10);
      expect(userRepo.create).toHaveBeenCalledWith({
        tenantId: TENANT_ID,
        email: EMAIL,
        passwordHash: PASSWORD_HASH,
        firstName: 'John',
        lastName: 'Doe',
        isActive: true,
        role: UserRole.CUSTOMER,
      });
      expect(userRepo.save).toHaveBeenCalledWith(createdUser);
      expect(result).toEqual({
        id: USER_ID,
        email: EMAIL,
        firstName: 'John',
        lastName: 'Doe',
        role: UserRole.CUSTOMER,
        tenantId: TENANT_ID,
        isActive: true,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt,
      });
    });

    it('should throw BadRequestException if user email already exists', async () => {
      userRepo.findOne.mockResolvedValue({ id: USER_ID });

      await expect(service.register(TENANT_ID, registerDto)).rejects.toThrow(
        new BadRequestException('Email already exists'),
      );
      expect(userRepo.save).not.toHaveBeenCalled();
    });
  });

  describe('login', () => {
    const loginDto = { email: EMAIL, password: PASSWORD };
    const user = {
      id: USER_ID,
      tenantId: TENANT_ID,
      email: EMAIL,
      passwordHash: PASSWORD_HASH,
      isActive: true,
      role: UserRole.CUSTOMER,
    } as User;

    it('should successfully log in and return access token', async () => {
      userRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(true);
      jwtService.signAsync
        .mockResolvedValueOnce('access_token_mock')
        .mockResolvedValueOnce('refresh_token_mock');

      const result = await service.login(TENANT_ID, loginDto);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, email: EMAIL },
      });
      expect(bcrypt.compare).toHaveBeenCalledWith(PASSWORD, PASSWORD_HASH);
      expect(jwtService.signAsync).toHaveBeenNthCalledWith(
        1,
        {
          sub: USER_ID,
          tenantId: TENANT_ID,
          email: EMAIL,
          role: UserRole.CUSTOMER,
        },
        { secret: 'access_secret', expiresIn: '15m' },
      );
      expect(result).toBe('access_token_mock');
    });

    it('should throw UnauthorizedException if user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.login(TENANT_ID, loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if account is deactivated', async () => {
      const inactiveUser = { ...user, isActive: false } as User;
      userRepo.findOne.mockResolvedValue(inactiveUser);

      await expect(service.login(TENANT_ID, loginDto)).rejects.toThrow(
        new UnauthorizedException('Account is deactivated'),
      );
      expect(bcrypt.compare).not.toHaveBeenCalled();
    });

    it('should throw UnauthorizedException if password incorrect', async () => {
      userRepo.findOne.mockResolvedValue(user);
      (bcrypt.compare as jest.Mock).mockResolvedValue(false);

      await expect(service.login(TENANT_ID, loginDto)).rejects.toThrow(
        new UnauthorizedException('Invalid credentials'),
      );
    });
  });

  describe('validateJwtPayload', () => {
    const payload = {
      sub: USER_ID,
      tenantId: TENANT_ID,
      email: EMAIL,
      role: UserRole.CUSTOMER,
    };
    const user = {
      id: USER_ID,
      tenantId: TENANT_ID,
      email: EMAIL,
      role: UserRole.CUSTOMER,
      firstName: 'John',
      lastName: 'Doe',
      isActive: true,
    } as User;

    it('should return simplified user details if valid payload and user found', async () => {
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.validateJwtPayload(payload);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID, tenantId: TENANT_ID },
      });
      expect(result).toEqual({
        id: USER_ID,
        email: EMAIL,
        role: UserRole.CUSTOMER,
        tenantId: TENANT_ID,
        firstName: 'John',
        lastName: 'Doe',
      });
    });

    it('should throw UnauthorizedException if user is not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.validateJwtPayload(payload)).rejects.toThrow(
        new UnauthorizedException('User not found'),
      );
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      const inactiveUser = { ...user, isActive: false } as User;
      userRepo.findOne.mockResolvedValue(inactiveUser);

      await expect(service.validateJwtPayload(payload)).rejects.toThrow(
        new UnauthorizedException('Account is deactivated'),
      );
    });
  });

  describe('findOneByEmail', () => {
    it('should return user when found', async () => {
      const user = { id: USER_ID } as User;
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.findOneByEmail(TENANT_ID, EMAIL);

      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, email: EMAIL },
      });
      expect(result).toBe(user);
    });

    it('should return null when not found', async () => {
      userRepo.findOne.mockResolvedValue(null);

      const result = await service.findOneByEmail(TENANT_ID, EMAIL);

      expect(result).toBeNull();
    });
  });

  describe('showUserInfo', () => {
    const user = { id: USER_ID, email: EMAIL } as User;
    const cacheKey = CacheKeys.user(TENANT_ID, USER_ID);

    it('should return cached user if exists', async () => {
      cache.get.mockResolvedValue(user);

      const result = await service.showUserInfo(TENANT_ID, USER_ID);

      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(userRepo.findOne).not.toHaveBeenCalled();
      expect(result).toBe(user);
    });

    it('should fetch from DB, cache it and return user if cache miss', async () => {
      cache.get.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.showUserInfo(TENANT_ID, USER_ID);

      expect(cache.get).toHaveBeenCalledWith(cacheKey);
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { id: USER_ID, tenantId: TENANT_ID, deletedAt: IsNull() },
      });
      expect(cache.set).toHaveBeenCalledWith(cacheKey, user, CACHE_TTL.USER);
      expect(result).toBe(user);
    });

    it('should throw NotFoundException if user not found in DB', async () => {
      cache.get.mockResolvedValue(null);
      userRepo.findOne.mockResolvedValue(null);

      await expect(service.showUserInfo(TENANT_ID, USER_ID)).rejects.toThrow(
        new NotFoundException('There is no user with this id'),
      );
      expect(cache.set).not.toHaveBeenCalled();
    });
  });

  describe('refreshToken', () => {
    const refreshTokenDto = { refreshToken: 'refresh_token_mock' };
    const payload = {
      sub: USER_ID,
      tenantId: TENANT_ID,
      email: EMAIL,
      role: UserRole.CUSTOMER,
    };
    const user = {
      id: USER_ID,
      tenantId: TENANT_ID,
      email: EMAIL,
      isActive: true,
      role: UserRole.CUSTOMER,
    } as User;

    it('should refresh tokens successfully', async () => {
      jwtService.verifyAsync.mockResolvedValue(payload);
      userRepo.findOne.mockResolvedValue(user);
      jwtService.signAsync
        .mockResolvedValueOnce('new_access_token')
        .mockResolvedValueOnce('new_refresh_token');

      const result = await service.refreshToken(TENANT_ID, refreshTokenDto);

      expect(jwtService.verifyAsync).toHaveBeenCalledWith(
        'refresh_token_mock',
        {
          secret: 'refresh_secret',
        },
      );
      expect(userRepo.findOne).toHaveBeenCalledWith({
        where: { tenantId: TENANT_ID, id: USER_ID },
      });
      expect(result).toEqual({
        user,
        accessToken: 'new_access_token',
        refreshToken: 'new_refresh_token',
      });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      jwtService.verifyAsync.mockResolvedValue(payload);
      userRepo.findOne.mockResolvedValue(null);

      await expect(
        service.refreshToken(TENANT_ID, refreshTokenDto),
      ).rejects.toThrow(new UnauthorizedException('User not found'));
    });

    it('should throw UnauthorizedException if user is deactivated', async () => {
      jwtService.verifyAsync.mockResolvedValue(payload);
      const inactiveUser = { ...user, isActive: false } as User;
      userRepo.findOne.mockResolvedValue(inactiveUser);

      await expect(
        service.refreshToken(TENANT_ID, refreshTokenDto),
      ).rejects.toThrow(new UnauthorizedException('Account is deactivated'));
    });
  });
});
