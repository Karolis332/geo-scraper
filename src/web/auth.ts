/**
 * Local auth helpers (password hashing, session token hashing, cookie parsing).
 */

import { createHash, pbkdf2Sync, randomBytes, timingSafeEqual } from 'node:crypto';

const PASSWORD_ALGO = 'pbkdf2-sha256';
const PASSWORD_ITERATIONS = 310_000;
const KEY_LENGTH = 32;

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString('hex');
  const hash = pbkdf2Sync(password, salt, PASSWORD_ITERATIONS, KEY_LENGTH, 'sha256').toString('hex');
  return `${PASSWORD_ALGO}$${PASSWORD_ITERATIONS}$${salt}$${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const parts = stored.split('$');
  if (parts.length !== 4) return false;

  const [algo, iterRaw, salt, expectedHashHex] = parts;
  if (algo !== PASSWORD_ALGO || !iterRaw || !salt || !expectedHashHex) return false;

  const iterations = Number.parseInt(iterRaw, 10);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;

  const actualHashHex = pbkdf2Sync(password, salt, iterations, KEY_LENGTH, 'sha256').toString('hex');

  const expected = Buffer.from(expectedHashHex, 'hex');
  const actual = Buffer.from(actualHashHex, 'hex');
  if (expected.length !== actual.length) return false;

  return timingSafeEqual(expected, actual);
}

export function createSessionToken(): string {
  return randomBytes(32).toString('hex');
}

export function hashSessionToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function parseCookieHeader(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};

  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(';')) {
    const [rawKey, ...rest] = part.trim().split('=');
    if (!rawKey || rest.length === 0) continue;
    const rawValue = rest.join('=');
    result[decodeURIComponent(rawKey)] = decodeURIComponent(rawValue);
  }

  return result;
}

export function buildSessionCookie(token: string, maxAgeSeconds: number, secure: boolean): string {
  const attrs = [
    `geo_session=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${maxAgeSeconds}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    attrs.push('Secure');
  }

  return attrs.join('; ');
}

export function buildClearSessionCookie(secure: boolean): string {
  const attrs = [
    'geo_session=',
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (secure) {
    attrs.push('Secure');
  }

  return attrs.join('; ');
}
