import { BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';

export type NormalizedMenuOptionValue = {
  name: string;
  priceDelta: number;
};

export function normalizeMenuOptionValues(values: Prisma.JsonValue): NormalizedMenuOptionValue[] {
  if (!Array.isArray(values) || values.length === 0) {
    throw new BadRequestException('Option values must be a non-empty array');
  }

  return values.map((entry, index) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry)) {
      throw new BadRequestException(`Option value ${index + 1} must be an object`);
    }

    const value = entry as Record<string, unknown>;
    const name = typeof value.name === 'string' ? value.name.trim() : '';
    const priceDelta = value.priceDelta ?? 0;

    if (!name) {
      throw new BadRequestException(`Option value ${index + 1} name is required`);
    }

    if (typeof priceDelta !== 'number' || !Number.isInteger(priceDelta) || priceDelta < 0) {
      throw new BadRequestException(`Option value ${name} priceDelta must be a non-negative integer`);
    }

    return { name, priceDelta };
  });
}
