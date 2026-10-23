import 'server-only';
import nodemailer, { type Transporter } from 'nodemailer';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

const cache = globalThis as unknown as { homewardMail?: Transporter };

/** Sends plain-text email through SMTP_URL (Mailpit in development; an EU provider later, #48). */
export async function sendMail(mail: Mail): Promise<void> {
  const url = process.env.SMTP_URL;
  if (!url) throw new Error('SMTP_URL is not set (see .env.example).');
  cache.homewardMail ??= nodemailer.createTransport(url);
  await cache.homewardMail.sendMail({
    from: process.env.EMAIL_FROM || 'Homeward <no-reply@homeward.localhost>',
    ...mail,
  });
}
