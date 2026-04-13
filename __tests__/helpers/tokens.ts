import jwt from 'jsonwebtoken';

const SECRET = process.env.JWT_SECRET!;

export const adminToken = () =>
  jwt.sign({ role: 'admin' }, SECRET, { expiresIn: '1d' });

export const sellerToken = (
  sellerId: number,
  opts?: { isEmployee?: boolean; isCashier?: boolean }
) =>
  jwt.sign(
    {
      sellerId,
      role: opts?.isEmployee ? 'employee' : 'seller',
      isEmployee: opts?.isEmployee ?? false,
      isCashier: opts?.isCashier ?? false,
    },
    SECRET,
    { expiresIn: '1d' }
  );

export const cashierToken = (sellerId: number) =>
  jwt.sign(
    { sellerId, role: 'employee', isEmployee: true, isCashier: true },
    SECRET,
    { expiresIn: '1d' }
  );

export const expiredToken = () =>
  jwt.sign({ role: 'seller', sellerId: 1 }, SECRET, { expiresIn: 0 });

export const badToken = () => 'not.a.valid.jwt';
