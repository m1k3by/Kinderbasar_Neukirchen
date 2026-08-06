if (!process.env.JWT_SECRET) {
  throw new Error('JWT_SECRET Umgebungsvariable ist nicht gesetzt.');
}
if (!process.env.ADMIN_PASS) {
  throw new Error('ADMIN_PASS Umgebungsvariable ist nicht gesetzt.');
}

export const env = {
  ADMIN_USER: process.env.ADMIN_USER || 'admin',
  ADMIN_PASS: process.env.ADMIN_PASS,
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: parseInt(process.env.SMTP_PORT || '587'),
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  MAIL_FROM: process.env.MAIL_FROM,
  JWT_SECRET: process.env.JWT_SECRET,
} as const;