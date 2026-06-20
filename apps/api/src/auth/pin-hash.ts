import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const PREFIX = 'pin:scrypt';
const KEY_LENGTH = 32;

export function hashPin(pin: string) {
  const salt = randomBytes(16).toString('base64url');
  const hash = scryptSync(pin, salt, KEY_LENGTH).toString('base64url');
  return `${PREFIX}:${salt}:${hash}`;
}

export function isLegacyPinHash(passwordHash: string) {
  return passwordHash.startsWith('pin:') && !passwordHash.startsWith(`${PREFIX}:`);
}

export function verifyPinHash(pin: string, passwordHash: string) {
  if (isLegacyPinHash(passwordHash)) {
    return passwordHash === `pin:${pin}`;
  }

  const [kind, algorithm, salt, storedHash] = passwordHash.split(':');
  if (kind !== 'pin' || algorithm !== 'scrypt' || !salt || !storedHash) {
    return false;
  }

  const expected = Buffer.from(storedHash, 'base64url');
  const actual = scryptSync(pin, salt, expected.length);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
