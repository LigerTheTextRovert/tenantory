import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '../../auth/enum/user-role.enum';
import { ApiProperty } from '@nestjs/swagger';

export class UpdateUserRoleDto {
  @ApiProperty({
    enum: UserRole,
    example: UserRole.TENANT_ADMIN,
    description: 'The new role for the user',
  })
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
