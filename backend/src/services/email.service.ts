import nodemailer from 'nodemailer';
import { config } from '../config';
import { logger } from '../utils/logger';

const transporter = nodemailer.createTransport({
  host: config.email.host,
  port: config.email.port,
  auth: config.email.user ? { user: config.email.user, pass: config.email.pass } : undefined,
});

export const emailService = {
  async sendVerificationEmail(to: string, token: string) {
    const link = `${config.frontendUrl}/verify-email?token=${token}`;
    return this.send(to, 'Verify your Kyuka Books account', `Click to verify: ${link}`);
  },

  async sendPasswordResetEmail(to: string, token: string) {
    const link = `${config.frontendUrl}/reset-password?token=${token}`;
    return this.send(to, 'Reset your Kyuka Books password', `Click to reset your password: ${link}`);
  },

  async send(to: string, subject: string, text: string, html?: string) {
    try {
      await transporter.sendMail({ from: config.email.from, to, subject, text, html });
    } catch (error) {
      logger.error('Failed to send email', { to, subject, error });
    }
  },
};
