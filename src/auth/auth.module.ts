import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuditModule } from '../audit/audit.module';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { User } from './entities/user.entity';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RoleGuard } from './guards/role.guard';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
	imports: [
		TypeOrmModule.forFeature([User]),
		PassportModule,
		AuditModule,
		JwtModule.registerAsync({
			inject: [ConfigService],
			useFactory: (config: ConfigService) => ({
				secret: config.get<string>('JWT_ACCESS_SECRET'),
				signOptions: { expiresIn: '15m' },
			}),
		}),
	],
	providers: [AuthService, JwtStrategy, JwtAuthGuard, RoleGuard],
	controllers: [AuthController],
})
export class AuthModule {}
