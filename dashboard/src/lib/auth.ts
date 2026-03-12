import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { cookies } from 'next/headers';
import { query } from './db';

const JWT_SECRET = process.env.JWT_SECRET || 'syb-backlinks-jwt-secret-change-me';
const COOKIE_NAME = 'syb_auth_token';
const TOKEN_EXPIRY = '7d';

interface User {
  id: string;
  email: string;
  name: string | null;
}

interface JWTPayload {
  userId: string;
  email: string;
}

export async function verifyCredentials(email: string, password: string): Promise<User | null> {
  const rows = await query<{ id: string; email: string; name: string | null; password_hash: string }>(
    'SELECT id, email, name, password_hash FROM users WHERE email = $1',
    [email.toLowerCase()]
  );

  if (rows.length === 0) return null;

  const user = rows[0];
  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) return null;

  return { id: user.id, email: user.email, name: user.name };
}

export function signToken(user: User): string {
  return jwt.sign(
    { userId: user.id, email: user.email } as JWTPayload,
    JWT_SECRET,
    { expiresIn: TOKEN_EXPIRY }
  );
}

export function verifyToken(token: string): JWTPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JWTPayload;
  } catch {
    return null;
  }
}

export async function getCurrentUser(): Promise<User | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME)?.value;
  if (!token) return null;

  const payload = verifyToken(token);
  if (!payload) return null;

  const rows = await query<User>(
    'SELECT id, email, name FROM users WHERE id = $1',
    [payload.userId]
  );

  return rows[0] || null;
}

export { COOKIE_NAME, TOKEN_EXPIRY };
