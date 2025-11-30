import nodemailer from 'nodemailer';
import { env } from './env';

const transporter = nodemailer.createTransport({
  host: env.SMTP_HOST,
  port: env.SMTP_PORT,
  secure: false,
  auth: {
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
  },
});

// attachments: optional array compatible with nodemailer attachments
export const sendMail = async (
  to: string,
  subject: string,
  html: string,
  attachments?: Array<{
    filename?: string;
    path?: string;
    content?: Buffer | string;
    cid?: string;
  }>
) => {
  const mailOptions: any = {
    from: env.MAIL_FROM,
    to,
    subject,
    html,
  };

  if (attachments && attachments.length > 0) {
    mailOptions.attachments = attachments;
  }

  await transporter.sendMail(mailOptions);
};