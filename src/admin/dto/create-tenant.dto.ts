import {
  IsString,
  IsEmail,
  IsNotEmpty,
  MaxLength,
  MinLength,
  Matches,
} from 'class-validator';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/^[a-z0-9-]+$/, {
    message:
      'domainName must contain only lowercase letters, numbers, and hyphens',
  })
  domainName: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  businessName: string;

  @IsEmail()
  @IsNotEmpty()
  @MaxLength(255)
  adminEmail: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  adminFirstName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(2)
  @MaxLength(255)
  adminLastName: string;

  @IsString()
  @IsNotEmpty()
  @MinLength(8)
  @MaxLength(50)
  adminPassword: string;
}
