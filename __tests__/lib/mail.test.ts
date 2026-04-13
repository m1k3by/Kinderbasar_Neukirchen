import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock nodemailer before importing mail
const sendMailMock = vi.fn().mockResolvedValue({ messageId: 'test-id' });
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn().mockReturnValue({
      sendMail: sendMailMock,
    }),
  },
}));

// Import after mocking
const { sendMail } = await import('@/app/lib/mail');

describe('sendMail', () => {
  beforeEach(() => {
    sendMailMock.mockClear();
  });

  it('calls transporter.sendMail with correct from/to/subject/html', async () => {
    await sendMail('recipient@test.com', 'Test Subject', '<p>hello</p>');
    expect(sendMailMock).toHaveBeenCalledOnce();
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.to).toBe('recipient@test.com');
    expect(opts.subject).toBe('Test Subject');
    expect(opts.html).toBe('<p>hello</p>');
  });

  it('does not include attachments key when not provided', async () => {
    await sendMail('a@b.com', 's', '<h1>hi</h1>');
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.attachments).toBeUndefined();
  });

  it('does not include attachments key for empty array', async () => {
    await sendMail('a@b.com', 's', 'html', []);
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.attachments).toBeUndefined();
  });

  it('includes attachments when a non-empty array is provided', async () => {
    const attachments = [{ filename: 'test.pdf', content: Buffer.from('pdf') }];
    await sendMail('a@b.com', 's', 'html', attachments);
    const opts = sendMailMock.mock.calls[0][0];
    expect(opts.attachments).toEqual(attachments);
  });

  it('propagates errors from transporter.sendMail', async () => {
    sendMailMock.mockRejectedValueOnce(new Error('SMTP failure'));
    await expect(sendMail('a@b.com', 's', 'html')).rejects.toThrow('SMTP failure');
  });
});
