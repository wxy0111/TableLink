import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';

export type AuthUser = {
  id: string;
  restaurantId: string;
  name: string;
  phone: string | null;
  role: Role;
};

type TokenPayload = AuthUser & {
  exp: number;
};

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  async login(phone: string, pin: string) {
    const user = await this.prisma.user.findFirst({
      where: { phone, status: 'active' },
    });

    if (!user || !this.verifyPin(pin, user.passwordHash)) {
      throw new UnauthorizedException('手机号或 PIN 不正确');
    }

    const authUser: AuthUser = {
      id: user.id,
      restaurantId: user.restaurantId,
      name: user.name,
      phone: user.phone,
      role: user.role,
    };

    return {
      token: this.signToken(authUser),
      user: authUser,
    };
  }

  verifyToken(token: string): AuthUser {
    const [encodedPayload, signature] = token.split('.');
    if (!encodedPayload || !signature) {
      throw new UnauthorizedException('Invalid token');
    }

    const expectedSignature = this.sign(encodedPayload);
    if (!this.safeEqual(signature, expectedSignature)) {
      throw new UnauthorizedException('Invalid token');
    }

    const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8')) as TokenPayload;
    if (payload.exp < Math.floor(Date.now() / 1000)) {
      throw new UnauthorizedException('Token expired');
    }

    return {
      id: payload.id,
      restaurantId: payload.restaurantId,
      name: payload.name,
      phone: payload.phone,
      role: payload.role,
    };
  }

  private verifyPin(pin: string, passwordHash: string) {
    return passwordHash === `pin:${pin}`;
  }

  private signToken(user: AuthUser) {
    const payload: TokenPayload = {
      ...user,
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12,
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
    return `${encodedPayload}.${this.sign(encodedPayload)}`;
  }

  private sign(value: string) {
    return createHmac('sha256', process.env.AUTH_SECRET ?? 'tablelink-local-dev-secret').update(value).digest('base64url');
  }

  private safeEqual(a: string, b: string) {
    const aBuffer = Buffer.from(a);
    const bBuffer = Buffer.from(b);
    return aBuffer.length === bBuffer.length && timingSafeEqual(aBuffer, bBuffer);
  }
}
