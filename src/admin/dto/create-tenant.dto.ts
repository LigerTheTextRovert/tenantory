import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';
import { ApiProperty } from '@nestjs/swagger';

export class CreateTenantDto {
  @ApiProperty({
    example: 'my-shop',
    description: 'Unique domain name for the tenant',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'domainName must contain only lowercase letters, numbers, and hyphens',
  })
  domainName: string;

  @ApiProperty({
    example: 'My Awesome Shop',
    description: 'Business name of the tenant',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string;

  @ApiProperty({
    example: 'admin@myshop.com',
    description: 'Email for the initial tenant admin',
  })
  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  adminEmail: string;

  @ApiProperty({
    example: 'John',
    description: 'First name of the tenant admin',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  adminFirstName: string;

  @ApiProperty({ example: 'Doe', description: 'Last name of the tenant admin' })
  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  adminLastName: string;

  @ApiProperty({
    example: 'StrongP@ssw0rd',
    description: 'Password for the tenant admin',
  })
  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  adminPassword: string;
}
