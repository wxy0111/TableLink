import { Injectable, UnauthorizedException } from '@nestjs/common';
import { Role } from '@prisma/client';
import { createHmac, timingSafeEqual } from 'crypto';
import { PrismaService } from '../prisma/prisma.service';
import { hashPin, isLegacyPinHash, verifyPinHash } from './pin-hash';

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

type LoginFailureState = {
  count: number;
  lockedUntil?: number;
};

const MAX_LOGIN_FAILURES = 5;
const LOGIN_LOCK_MS = 5 * 60 * 1000;

@Injectable()
export class AuthService {
  private readonly loginFailures = new Map<string, LoginFailureState>();

  constructor(private readonly prisma: PrismaService) {}

  async login(phone: string, pin: string, ipAddress?: string) {
    this.assertLoginNotLocked(phone, ipAddress);

    const user = await this.prisma.user.findFirst({
      where: { phone, status: 'active' },
    });

    if (!user || !this.verifyPin(pin, user.passwordHash)) {
      this.recordLoginFailure(phone, ipAddress);
      throw new UnauthorizedException('Phone or PIN is incorrect');
    }

    this.clearLoginFailures(phone, ipAddress);

    if (isLegacyPinHash(user.passwordHash)) {
      await this.prisma.user.update({
        where: { id: user.id },
        data: { passwordHash: hashPin(pin) },
      });
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

  verifyPin(pin: string, passwordHash: string) {
    return verifyPinHash(pin, passwordHash);
  }

  private assertLoginNotLocked(phone: string, ipAddress?: string) {
    const now = Date.now();
    for (const key of this.loginFailureKeys(phone, ipAddress)) {
      const state = this.loginFailures.get(key);
      if (state?.lockedUntil && state.lockedUntil > now) {
        throw new UnauthorizedException('Login temporarily locked');
      }

      if (state?.lockedUntil && state.lockedUntil <= now) {
        this.loginFailures.delete(key);
      }
    }
  }

  private recordLoginFailure(phone: string, ipAddress?: string) {
    const now = Date.now();
    for (const key of this.loginFailureKeys(phone, ipAddress)) {
      const current = this.loginFailures.get(key);
      const count = (current?.count ?? 0) + 1;
      this.loginFailures.set(key, {
        count,
        lockedUntil: count >= MAX_LOGIN_FAILURES ? now + LOGIN_LOCK_MS : current?.lockedUntil,
      });
    }
  }

  private clearLoginFailures(phone: string, ipAddress?: string) {
    for (const key of this.loginFailureKeys(phone, ipAddress)) {
      this.loginFailures.delete(key);
    }
  }

  private loginFailureKeys(phone: string, ipAddress?: string) {
    return [`phone:${phone}`, ...(ipAddress ? [`ip:${ipAddress}`] : [])];
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
