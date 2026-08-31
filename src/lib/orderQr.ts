const STABLE_APP_URL = 'https://quick-bite-quick-bite5.vercel.app';

export function getOrderVerificationUrl(pickupCode: string): string {
  const baseUrl = (import.meta.env.VITE_PUBLIC_APP_URL ?? STABLE_APP_URL).replace(/\/$/, '');
  return `${baseUrl}/verify-order?code=${encodeURIComponent(pickupCode)}`;
}
