import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Req, Res } from '@nestjs/common';
import { randomUUID, timingSafeEqual } from 'node:crypto';
import type { Request, Response } from 'express';
import { ApiCookieAuth, ApiExcludeController, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { LoginDto } from './login.dto';
import { ActivateAccountDto } from './activate-account.dto';
import { cookiePolicy } from '../security/security-policy';
import { UnauthorizedException } from '@nestjs/common';

function requestId(): string {
  return randomUUID();
}

@ApiTags('Authentication / Roles')
@Controller('api/v1/auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @ApiOperation({ summary: 'Sign in, sets an HttpOnly session cookie' })
  @Post('login')
  @HttpCode(200)
  async login(@Body() body: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(body.user_id, body.password);
    const policy = cookiePolicy(process.env.APP_ENV ?? 'local', process.env.APP_ORIGIN ?? 'http://localhost:5173');
    response.cookie(policy.name, result.token, policy.options);
    response.setHeader('Cache-Control', 'no-store');
    return { data: { expiresIn: 900, user: result.user }, requestId: requestId() };
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Validate current session' })
  @Get('me')
  async me(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    const user = await this.auth.currentUser(request.headers.cookie);
    return { data: { user }, requestId: requestId() };
  }

  @ApiOperation({ summary: 'Log out, clear HttpOnly cookie' })
  @Post('logout')
  @HttpCode(204)
  logout(@Res({ passthrough: true }) response: Response): void {
    const policy = cookiePolicy(process.env.APP_ENV ?? 'local', process.env.APP_ORIGIN ?? 'http://localhost:5173');
    response.clearCookie(policy.name, { path: '/', httpOnly: true, secure: policy.options.secure, sameSite: 'lax' });
    response.setHeader('Cache-Control', 'no-store');
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'List fixed HR/EMPLOYEE role catalog (HR only)' })
  @Get('roles')
  async roles(@Req() request: Request) {
    const actor = await this.auth.currentUser(request.headers.cookie);
    return { data: await this.auth.listRoles(actor), requestId: requestId() };
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'Check employee account activation status (HR only)' })
  @Get('accounts/:employeeId/status')
  async status(@Param('employeeId') employeeId: string, @Req() request: Request) {
    const actor = await this.auth.currentUser(request.headers.cookie);
    const status = await this.auth.accountStatus(employeeId, actor);
    return { data: { status }, requestId: requestId() };
  }

  @ApiCookieAuth('access_token')
  @ApiOperation({ summary: 'HR sets initial/new password to activate a PENDING employee account' })
  @Post('accounts/:employeeId/activate')
  @HttpCode(200)
  async activate(
    @Param('employeeId', new ParseUUIDPipe()) employeeId: string,
    @Req() request: Request,
    @Body() body: ActivateAccountDto,
    @Res({ passthrough: true }) response: Response,
  ) {
    const actor = await this.auth.currentUser(request.headers.cookie);
    await this.auth.activatePendingAccount(employeeId, body.password, actor);
    response.setHeader('Cache-Control', 'no-store');
    return { data: { status: 'ACTIVE' }, requestId: requestId() };
  }
}

@ApiExcludeController()
@Controller('internal/auth')
export class InternalAuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('verify')
  async verify(@Headers('x-service-key') suppliedKey: string | undefined, @Body() body: { cookie?: string }) {
    const expected = process.env.INTERNAL_SERVICE_KEY ?? '';
    const actual = suppliedKey ?? '';
    const matches = expected.length > 0 && actual.length === expected.length &&
      timingSafeEqual(Buffer.from(actual), Buffer.from(expected));
    if (!matches) throw new UnauthorizedException('Akses internal ditolak');
    if (typeof body?.cookie !== 'string') throw new UnauthorizedException('Cookie tidak tersedia');
    return { data: { user: await this.auth.currentUser(body.cookie) } };
  }
}
