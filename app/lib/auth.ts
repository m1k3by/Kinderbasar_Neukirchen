import jwt from 'jsonwebtoken';
import { env } from './env';

export const createToken = (payload: object) => {
  return jwt.sign(payload, env.JWT_SECRET, { expiresIn: '1d' });
};

export const verifyToken = (token: string) => {
  return jwt.verify(token, env.JWT_SECRET);
};