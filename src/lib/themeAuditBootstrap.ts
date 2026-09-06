import { installDarkSurfaceAudit } from './themeAudit';

export function startThemeAudit(): () => void {
  if (!import.meta.env.DEV || typeof document === 'undefined') return () => undefined;

  let cleanup = () => undefined;
  const sync = () => {
    cleanup();
    cleanup = installDarkSurfaceAudit();
  };

  const observer = new MutationObserver(sync);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ['data-qb-theme'] });
  sync();

  return () => {
    observer.disconnect();
    cleanup();
  };
}
