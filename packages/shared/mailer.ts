/**
 * Opt-in email transport via Nodemailer.
 *
 * The mailer is only active when `SMTP_HOST` is set in the environment.
 * Callers should always check `isMailEnabled()` before calling `sendMail()`.
 *
 * Required environment variables (only when mail is enabled):
 * - `SMTP_HOST`    — SMTP server hostname.
 * - `SMTP_PORT`    — SMTP port (default `587`).
 * - `SMTP_USER`    — SMTP authentication username.
 * - `SMTP_PASS`    — SMTP authentication password.
 * - `SMTP_SENDER`  — Default `From` address.
 * - `SMTP_SECURE`  — `"true"` for port 465 / TLS (default `"false"`).
 *
 * @module shared/mailer
 */

import { createTransport, type SendMailOptions, type SentMessageInfo } from 'nodemailer';
import { envNumber } from './utils';

/**
 * Returns `true` when the mailer is configured (i.e. `SMTP_HOST` is set).
 *
 * @returns Whether email sending is available.
 */
export const isMailEnabled = (): boolean =>
    Boolean(process.env.SMTP_HOST && process.env.SMTP_HOST.trim() !== '');

/**
 * Lazily-created Nodemailer transporter.
 * Only constructed on first use to avoid startup errors when SMTP is not configured.
 */
let transporter: ReturnType<typeof createTransport> | undefined;

/**
 * Get (or lazily create) the Nodemailer transporter.
 *
 * @returns The shared transporter instance.
 * @throws {Error} When called without `SMTP_HOST` being set.
 */
const getTransporter = (): ReturnType<typeof createTransport> => {
    if (!isMailEnabled()) throw new Error('Mailer is not configured: SMTP_HOST is not set');

    if (!transporter) {
        transporter = createTransport({
            host: process.env.SMTP_HOST ?? '',
            port: envNumber(process.env.SMTP_PORT, 587),
            secure: process.env.SMTP_SECURE === 'true',
            auth: {
                user: process.env.SMTP_USER ?? '',
                pass: process.env.SMTP_PASS ?? ''
            }
        });
    }

    return transporter;
};

/**
 * Send an email using the configured SMTP transporter.
 *
 * Always check `isMailEnabled()` before calling this function.
 * The `from` field defaults to `SMTP_SENDER` if not provided in `options`.
 *
 * @param options - Standard Nodemailer `SendMailOptions`.
 * @returns A promise resolving to Nodemailer's `SentMessageInfo`.
 * @throws {Error} When SMTP is not configured or sending fails.
 */
export const sendMail = (options: SendMailOptions): Promise<SentMessageInfo> =>
    Promise.resolve(getTransporter()).then((activeTransporter) =>
        activeTransporter.sendMail({
            from: process.env.SMTP_SENDER,
            ...options
        })
    );
