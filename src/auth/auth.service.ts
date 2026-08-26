import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { RegisterDto } from './dto/register.dto';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from './entities/user.entity';
import { IsNull, Repository } from 'typeorm';

import * as bcrypt from 'bcryptjs';
import { UserRole } from './enum/user-role.enum';
import { UserResponseDto } from './dto/user-response.dto';
import { JwtPayload } from './interfaces/jwt-payload.interface';
import { LoginDto } from './dto/login.dto';
import { RefreshTokenDto } from './dto/refresh-token.dto';
import { ConfigService } from '@nestjs/config';
import { CacheService } from '../common/services/cache.service';
import { CACHE_TTL, CacheKeys } from '../common/constants/cache.constants';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly configService: ConfigService,
    private readonly jwtService: JwtService,
    private readonly cache: CacheService,
  ) {}

  async register(tenantId: string, dto: RegisterDto) {
    const user = await this.findOneByEmail(tenantId, dto.email);

    if (user) {
      throw new BadRequestException('Email already exists');
    }

    const passwordHash = await bcrypt.hash(dto.password, 10);

    const newUser: User = this.userRepo.create({
      tenantId,
      email: dto.email,
      passwordHash,
      firstName: dto.firstName,
      lastName: dto.lastName,
      isActive: true,
      role: dto.role || UserRole.CUSTOMER,
    });

    const savedUser = await this.userRepo.save(newUser);
    return this.toUserResponseDto(savedUser);
  }

  async login(tenantId: string, dto: LoginDto): Promise<string> {
    const user = await this.findOneByEmail(tenantId, dto.email);

    if (!user) {
      throw new UnauthorizedException('Invalid credentials');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const isPassportCorrect = await bcrypt.compare(
      dto.password,
      user.passwordHash,
    );

    if (!isPassportCorrect) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { accessToken } = await this.generateTokens(user);

    return accessToken;
  }

  async validateJwtPayload(jwtPayload: JwtPayload) {
    const user = await this.userRepo.findOne({
      where: { id: jwtPayload.sub, tenantId: jwtPayload.tenantId },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      tenantId: user.tenantId,
      firstName: user.firstName,
      lastName: user.lastName,
    };
  }

  async findOneByEmail(tenantId: string, email: string): Promise<User | null> {
    const user = await this.userRepo.findOne({
      where: {
        tenantId,
        email,
      },
    });

    if (!user) {
      return null;
    }

    return user;
  }

  async showUserInfo(tenantId: string, id: string) {
    const cacheKey = CacheKeys.user(tenantId, id);
    const cached = await this.cache.get<User>(cacheKey);
    if (cached) {
      return cached;
    }

    const user = await this.userRepo.findOne({
      where: {
        id,
        tenantId,
        deletedAt: IsNull(),
      },
    });

    if (!user) {
      throw new NotFoundException('There is no user with this id');
    }

    await this.cache.set(cacheKey, user, CACHE_TTL.USER);

    return user;
  }

  private toUserResponseDto(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      tenantId: user.tenantId,
      isActive: user.isActive,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };
  }

  private async generateTokens(user: User) {
    const payload: JwtPayload = {
      sub: user.id,
      tenantId: user.tenantId,
      email: user.email,
      role: user.role,
    };

    const [accessToken, refreshToken] = await Promise.all([
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_ACCESS_SECRET'),
        expiresIn: '15m',
      }),
      this.jwtService.signAsync(payload, {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
        expiresIn: '15m',
      }),
    ]);

    return {
      accessToken,
      refreshToken,
    };
  }

  // implement refreshToken, first validate user, then if everything alright, generate a token.
  async refreshToken(tenantId: string, { refreshToken }: RefreshTokenDto) {
    const payload = await this.jwtService.verifyAsync<JwtPayload>(
      refreshToken,
      {
        secret: this.configService.get('JWT_REFRESH_SECRET'),
      },
    );

    const user = await this.userRepo.findOne({
      where: {
        tenantId,
        id: payload.sub,
      },
    });

    if (!user) {
      throw new UnauthorizedException('User not found');
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated');
    }

    const tokens = await this.generateTokens(user);

    return {
      user,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
    };
  }
}
