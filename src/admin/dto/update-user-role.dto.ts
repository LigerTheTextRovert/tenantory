import { IsEnum, IsNotEmpty } from 'class-validator';
import { UserRole } from '../../auth/enum/user-role.enum';

export class UpdateUserRoleDto {
  @IsEnum(UserRole)
  @IsNotEmpty()
  role: UserRole;
}
