import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Prisma mock ──────────────────────────────────────────────────────────────
const prismaMock = vi.hoisted(() => ({
  seller: { findUnique: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

// ─── QR / Barcode lib mocks ───────────────────────────────────────────────────
const generateQRMock      = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,QR=='));
const generateBarcodeMock = vi.hoisted(() => vi.fn().mockResolvedValue('data:image/png;base64,BC=='));

vi.mock('@/app/lib/qr', () => ({
  generateQR:      generateQRMock,
  generateBarcode: generateBarcodeMock,
}));

import { GET as getQR }      from '@/app/api/sellers/[id]/qr/route';
import { GET as getBarcode } from '@/app/api/sellers/[id]/barcode/route';

function makeRequest(id: string) {
  return {
    request: new Request(`http://localhost/api/sellers/${id}/qr`) as any,
    context: { params: Promise.resolve({ id }) },
  };
}

const fakeSeller = { sellerId: 1234, firstName: 'Max', lastName: 'Muster' };

describe('GET /api/sellers/[id]/qr', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for non-numeric id', async () => {
    const { request, context } = makeRequest('abc');
    const res = await getQR(request, context);
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const { request, context } = makeRequest('9999');
    const res = await getQR(request, context);
    expect(res.status).toBe(404);
  });

  it('returns qrCode for valid seller → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(fakeSeller);
    const { request, context } = makeRequest('1234');
    const res = await getQR(request, context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.qrCode).toBeDefined();
    expect(generateQRMock).toHaveBeenCalledWith('1234_Muster_Max');
  });

  it('returns 500 on generateQR error', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(fakeSeller);
    generateQRMock.mockRejectedValueOnce(new Error('QR fail'));
    const { request, context } = makeRequest('1234');
    const res = await getQR(request, context);
    expect(res.status).toBe(500);
  });
});

describe('GET /api/sellers/[id]/barcode', () => {
  beforeEach(() => vi.clearAllMocks());

  it('returns 400 for non-numeric id', async () => {
    const { request, context } = makeRequest('abc');
    const res = await getBarcode(request, context);
    expect(res.status).toBe(400);
  });

  it('returns 404 when seller not found', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(null);
    const { request, context } = makeRequest('9999');
    const res = await getBarcode(request, context);
    expect(res.status).toBe(404);
  });

  it('returns barcode for valid seller → 200', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(fakeSeller);
    const { request, context } = makeRequest('1234');
    const res = await getBarcode(request, context);
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.barcode).toBeDefined();
    expect(generateBarcodeMock).toHaveBeenCalledWith('1234_Muster_Max');
  });

  it('returns 500 on generateBarcode error', async () => {
    prismaMock.seller.findUnique.mockResolvedValue(fakeSeller);
    generateBarcodeMock.mockRejectedValueOnce(new Error('barcode fail'));
    const { request, context } = makeRequest('1234');
    const res = await getBarcode(request, context);
    expect(res.status).toBe(500);
  });
});
