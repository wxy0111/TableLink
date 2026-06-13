import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Role } from '@prisma/client';
import { Request } from 'express';
import { AuthService, AuthUser } from './auth.service';
import { ROLES_KEY } from './roles.decorator';

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
};

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly authService: AuthService,
    private readonly reflector: Reflector,
  ) {}

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = this.getToken(request);
    if (!token) {
      throw new UnauthorizedException('请先登录');
    }

    const user = this.authService.verifyToken(token);
    request.user = user;

    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (roles?.length && !roles.includes(user.role)) {
      throw new ForbiddenException('当前账号无权访问');
    }

    return true;
  }

  private getToken(request: Request) {
    const authorization = request.headers.authorization;
    if (authorization) {
      const [type, token] = authorization.split(' ');
      if (type === 'Bearer') return token;
    }

    const cookieHeader = request.headers.cookie;
    if (!cookieHeader) return null;
    const tokenCookie = cookieHeader
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('tablelink_token='));
    return tokenCookie ? decodeURIComponent(tokenCookie.split('=').slice(1).join('=')) : null;
  }
}
