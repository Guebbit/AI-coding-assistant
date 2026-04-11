import type { SocialProvider } from "./social.types";
import { getProviderPolicy } from "./social.providers";

const providerLastCall = new Map<SocialProvider, number>();
const DEFAULT_RATE_LIMIT_MS = 1000;

function nowMs(): number {
  return Date.now();
}

export function enforceRateLimit(provider: SocialProvider): void {
  const last = providerLastCall.get(provider) ?? 0;
  const minInterval = parseInt(
    process.env.SOCIAL_RATE_LIMIT_MS ?? String(DEFAULT_RATE_LIMIT_MS),
    10
  );

  const elapsed = nowMs() - last;
  if (elapsed < minInterval) {
    throw new Error(
      `Rate limit reached for ${provider}. Please retry in ${minInterval - elapsed} ms.`
    );
  }

  providerLastCall.set(provider, nowMs());
}

export function assertAllowedHost(
  provider: SocialProvider,
  targetUrl: string
): void {
  const parsed = new URL(targetUrl);
  const policy = getProviderPolicy(provider);
  if (!policy.allowedHosts.includes(parsed.host)) {
    throw new Error(`Blocked host "${parsed.host}" for provider "${provider}".`);
  }
}

function sanitizeText(value: string): string {
  // Broad RFC-style email detector for redaction (not strict validation).
  const emailPattern =
    /\b[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+\b/g;
  // Captures phone-like sequences, then digit-length checks limit false positives.
  const phoneCandidatePattern = /(?:\+?\d[\d\s().-]{8,}\d)/g;

  return value
    .replace(emailPattern, "[REDACTED_EMAIL]")
    .replace(phoneCandidatePattern, (candidate) => {
      const digitCount = candidate.replace(/\D/g, "").length;
      const hasPhoneSeparator = /[\s().-]/.test(candidate);
      return hasPhoneSeparator && digitCount >= 10 && digitCount <= 15
        ? "[REDACTED_PHONE]"
        : candidate;
    });
}

export function sanitizePii<T>(value: T): T {
  if (typeof value === "string") {
    return sanitizeText(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizePii(item)) as T;
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const sanitized: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(record)) {
      sanitized[key] = sanitizePii(item);
    }
    return sanitized as T;
  }

  return value;
}
