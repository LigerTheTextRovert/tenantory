import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
	ApiBearerAuth,
	ApiOperation,
	ApiResponse,
	ApiTags,
} from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator';
import { TenantDecorator } from '../common/decorators/tenant.decorator';
import type { AuthService } from './auth.service';
import type { LoginDto } from './dto/login.dto';
import type { RefreshTokenDto } from './dto/refresh-token.dto';
import type { RegisterDto } from './dto/register.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { type RequestWithUser, RoleGuard } from './guards/role.guard';

@ApiTags('Auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
	constructor(private readonly authService: AuthService) {}

	@Get()
	@ApiOperation({ summary: 'Get current user profile' })
	@ApiResponse({
		status: 200,
		description: 'User profile retrieved successfully.',
	})
	@ApiResponse({ status: 401, description: 'Unauthorized.' })
	@UseGuards(JwtAuthGuard, RoleGuard)
	async me(
		@TenantDecorator('id') tenantId: string,
		@Req() request: RequestWithUser,
	) {
		return this.authService.showUserInfo(tenantId, request.user.id);
	}

	@Post('register')
	@Public()
	@ApiOperation({ summary: 'Register a new user' })
	@ApiResponse({ status: 201, description: 'User registered successfully.' })
	@ApiResponse({
		status: 400,
		description: 'Bad Request (e.g. Email already exists).',
	})
	async register(
		@TenantDecorator('id') tenantId: string,
		@Body() dto: RegisterDto,
	) {
		return this.authService.register(tenantId, dto);
	}

	@Post('login')
	@Public()
	@ApiOperation({ summary: 'Login user and get tokens' })
	@ApiResponse({ status: 200, description: 'User logged in successfully.' })
	@ApiResponse({
		status: 401,
		description: 'Invalid credentials or deactivated account.',
	})
	async login(@TenantDecorator('id') tenantId: string, @Body() dto: LoginDto) {
		return this.authService.login(tenantId, dto);
	}

	@Post('refresh')
	@Public()
	@ApiOperation({ summary: 'Refresh access token' })
	@ApiResponse({ status: 200, description: 'Token refreshed successfully.' })
	@ApiResponse({
		status: 401,
		description: 'Invalid or expired refresh token.',
	})
	async refresh(
		@TenantDecorator('id') tenantId: string,
		@Body() dto: RefreshTokenDto,
	) {
		return this.authService.refreshToken(tenantId, dto);
	}
}
