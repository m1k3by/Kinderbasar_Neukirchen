import { describe, it, expect, vi, beforeEach } from 'vitest';
import path from 'path';

const prismaMock = vi.hoisted(() => ({
  mailQueue: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() },
}));
vi.mock('@/app/lib/prisma', () => ({ prisma: prismaMock }));

const sendMailMock = vi.hoisted(() => vi.fn());
vi.mock('@/app/lib/mail', () => ({ sendMail: sendMailMock }));

import { deliverMail, drainMailQueue } from '@/app/lib/mailQueue';

const zeile = {
  id: 'm1',
  to: 'a@b.de',
  subject: 'Betreff',
  html: '<p>hallo</p>',
  attachmentsJson: null as string | null,
  attempts: 0,
  status: 'PENDING',
};

describe('deliverMail', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sendet und markiert die Zeile als SENT', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue(zeile);
    await deliverMail('m1');
    expect(sendMailMock).toHaveBeenCalledWith('a@b.de', 'Betreff', '<p>hallo</p>', undefined);
    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'm1' }, data: expect.objectContaining({ status: 'SENT' }) })
    );
  });

  it('rührt eine bereits versendete Zeile nicht an', async () => {
    // Sonst ginge dieselbe Mail zweimal raus, wenn zwischenzeitlich ein Stapellauf lief.
    prismaMock.mailQueue.findUnique.mockResolvedValue({ ...zeile, status: 'SENT' });
    await deliverMail('m1');
    expect(sendMailMock).not.toHaveBeenCalled();
    expect(prismaMock.mailQueue.update).not.toHaveBeenCalled();
  });

  it('wirft nicht, wenn SMTP scheitert – zählt den Versuch hoch', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue(zeile);
    sendMailMock.mockRejectedValue(new Error('535 auth failed'));
    await expect(deliverMail('m1')).resolves.toBeUndefined();
    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ attempts: 1, status: 'PENDING', lastError: '535 auth failed' }),
      })
    );
  });

  it('markiert FAILED erst beim fünften Fehlversuch', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue({ ...zeile, attempts: 4 });
    sendMailMock.mockRejectedValue(new Error('weg'));
    await deliverMail('m1');
    expect(prismaMock.mailQueue.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ attempts: 5, status: 'FAILED' }) })
    );
  });
});

// ── Regression: Anhangspfade sind umgebungsabhängig ──────────────────────────
// Die Registrierung speichert path.join(process.cwd(), '...') in der Zeile – auf Vercel
// /var/task. Wird die Zeile anderswo zugestellt (anderer Cron-Lauf, Entwicklerrechner),
// zeigt der Pfad ins Leere. Am 26.08.2026 scheiterten dadurch genau die vier
// Registrierungsmails mit ENOENT, während die 32 anhanglosen durchgingen.
describe('Anhänge werden beim Senden neu aufgelöst', () => {
  beforeEach(() => vi.clearAllMocks());

  it('ersetzt einen fremden absoluten Pfad durch einen unter dem aktuellen cwd', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue({
      ...zeile,
      attachmentsJson: JSON.stringify([
        { filename: 'Info.jpeg', path: '/var/task/Info.jpeg' },
      ]),
    });

    await deliverMail('m1');

    const [, , , attachments] = sendMailMock.mock.calls[0];
    expect(attachments).toEqual([
      { filename: 'Info.jpeg', path: path.join(process.cwd(), 'Info.jpeg') },
    ]);
  });

  it('lässt Anhänge ohne Pfad unverändert', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue({
      ...zeile,
      attachmentsJson: JSON.stringify([{ filename: 'x.txt', content: 'abc' }]),
    });
    await deliverMail('m1');
    expect(sendMailMock.mock.calls[0][3]).toEqual([{ filename: 'x.txt', content: 'abc' }]);
  });

  it('kaputtes JSON führt nicht zum Absturz, sondern zu "keine Anhänge"', async () => {
    prismaMock.mailQueue.findUnique.mockResolvedValue({ ...zeile, attachmentsJson: '{kaputt' });
    await deliverMail('m1');
    expect(sendMailMock).toHaveBeenCalledWith('a@b.de', 'Betreff', '<p>hallo</p>', undefined);
  });
});

describe('drainMailQueue', () => {
  beforeEach(() => vi.clearAllMocks());

  it('holt PENDING und noch nicht ausgereizte FAILED, älteste zuerst', async () => {
    prismaMock.mailQueue.findMany.mockResolvedValue([]);
    await drainMailQueue();
    expect(prismaMock.mailQueue.findMany).toHaveBeenCalledWith({
      where: {
        OR: [
          { status: 'PENDING' },
          { status: 'FAILED', attempts: { lt: 5 } },
        ],
      },
      orderBy: { createdAt: 'asc' },
      take: 20,
    });
  });

  it('zählt Erfolge und Fehler getrennt', async () => {
    prismaMock.mailQueue.findMany.mockResolvedValue([zeile, { ...zeile, id: 'm2' }]);
    sendMailMock.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('weg'));
    expect(await drainMailQueue()).toEqual({ processed: 2, sent: 1, failed: 1 });
  });
});
