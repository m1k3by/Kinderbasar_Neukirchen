import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock external barcode/QR libraries
vi.mock('qrcode', () => ({
  default: {
    toDataURL: vi.fn().mockResolvedValue('data:image/png;base64,QRDATA=='),
  },
}));

const toBufferMock = vi.hoisted(() =>
  vi.fn().mockResolvedValue(Buffer.from('BARCODEDATA'))
);
vi.mock('bwip-js', () => ({
  default: { toBuffer: toBufferMock },
}));

import QRCode from 'qrcode';
import { generateQR, generateBarcode } from '@/app/lib/qr';

describe('generateQR', () => {
  beforeEach(() => {
    vi.mocked(QRCode.toDataURL).mockClear();
  });

  it('returns the data URL from QRCode.toDataURL', async () => {
    const result = await generateQR('https://example.com');
    expect(result).toBe('data:image/png;base64,QRDATA==');
  });

  it('passes the input text through to QRCode.toDataURL', async () => {
    await generateQR('my-qr-text');
    expect(QRCode.toDataURL).toHaveBeenCalledWith('my-qr-text');
  });

  it('throws "Failed to generate QR code" when QRCode.toDataURL rejects', async () => {
    vi.mocked(QRCode.toDataURL).mockRejectedValueOnce(new Error('QR error'));
    await expect(generateQR('x')).rejects.toThrow('Failed to generate QR code');
  });
});

describe('generateBarcode', () => {
  beforeEach(() => {
    toBufferMock.mockClear();
    toBufferMock.mockResolvedValue(Buffer.from('BARCODEDATA'));
  });

  it('returns a data:image/png;base64,... URL', async () => {
    const result = await generateBarcode('TEST123');
    expect(result).toMatch(/^data:image\/png;base64,/);
  });

  it('sanitizes German umlauts before passing to bwip-js', async () => {
    await generateBarcode('äöüÄÖÜß_');
    const call = toBufferMock.mock.calls[0][0];
    expect(call.text).toBe('aeoeueAeOeUess ');
  });

  it('replaces underscores with spaces', async () => {
    await generateBarcode('some_thing');
    expect(toBufferMock.mock.calls[0][0].text).toBe('some thing');
  });

  it('leaves plain ASCII text unchanged', async () => {
    await generateBarcode('Hello123');
    expect(toBufferMock.mock.calls[0][0].text).toBe('Hello123');
  });

  it('throws "Failed to generate barcode" when bwip-js rejects', async () => {
    toBufferMock.mockRejectedValueOnce(new Error('barcode error'));
    await expect(generateBarcode('x')).rejects.toThrow('Failed to generate barcode');
  });
});
