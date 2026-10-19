const STABLE_APP_URL = 'https://quick-bite-quick-bite5.vercel.app';

export function getOrderVerificationUrl(pickupCode: string): string {
  const baseUrl = (import.meta.env.VITE_PUBLIC_APP_URL ?? STABLE_APP_URL).replace(/\/$/, '');
  return `${baseUrl}/verify-order?code=${encodeURIComponent(pickupCode)}`;
}

/** Extracts the canonical order code from the QR URL or a raw code typed manually. */
export function extractOrderVerificationCode(rawValue: string): string {
  const raw = rawValue.trim();
  if (!raw) return '';
  try {
    const parsed = new URL(raw);
    const code = parsed.searchParams.get('code');
    if (code) return code.trim().toUpperCase();
  } catch {
    // A printed QR may contain only the pickup code rather than a full URL.
  }
  return raw.toUpperCase();
}
