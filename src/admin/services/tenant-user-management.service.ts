import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { User } from '../../auth/entities/user.entity';
import { InviteUserDto } from '../dto/invite-user.dto';
import { UpdateUserRoleDto } from '../dto/update-user-role.dto';
import * as bcrypt from 'bcryptjs';
import { isUniqueViolation } from '../../common/utils/assert-unique.util';
import { UserRole } from '../../auth/enum/user-role.enum';
import { CacheService } from '../../common/services/cache.service';
import { CacheKeys } from '../../common/constants/cache.constants';

@Injectable()
export class TenantUserManagementService {
  constructor(
    @InjectRepository(User)
    private readonly userRepo: Repository<User>,
    private readonly cache: CacheService,
  ) {}

  async inviteUser(tenantId: string, dto: InviteUserDto): Promise<User> {
    const existingUser = await this.userRepo.findOne({
      where: { email: dto.email, tenantId },
    });

    if (existingUser) {
      throw new BadRequestException(
        'User with this email already exists in this tenant',
      );
    }

    if (dto.role === UserRole.SUPER_ADMIN) {
      throw new BadRequestException('Cannot invite a user as Super Admin');
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const newUser = this.userRepo.create({
      tenantId,
      email: dto.email,
      firstName: dto.firstName,
      lastName: dto.lastName,
      passwordHash,
      role: dto.role,
      isActive: true,
    });

    try {
      return await this.userRepo.save(newUser);
    } catch (error: unknown) {
      if (isUniqueViolation(error)) {
        throw new ConflictException(
          'A user with this unique identifier already exists',
        );
      }
      throw new InternalServerErrorException(
        'An error occurred during user invitation',
      );
    }
  }

  async updateUserRole(
    tenantId: string,
    userId: string,
    dto: UpdateUserRoleDto,
  ): Promise<User> {
    const user = await this.userRepo.findOne({
      where: { id: userId, tenantId },
    });

    if (!user) {
      throw new NotFoundException('User not found in this tenant');
    }

    if (
      user.role === UserRole.SUPER_ADMIN ||
      dto.role === UserRole.SUPER_ADMIN
    ) {
      throw new BadRequestException('Cannot assign or modify Super Admin role');
    }

    user.role = dto.role;

    try {
      const saved = await this.userRepo.save(user);
      await this.cache.del(CacheKeys.user(tenantId, userId));
      return saved;
    } catch {
      throw new InternalServerErrorException('Failed to update user role');
    }
  }
}
