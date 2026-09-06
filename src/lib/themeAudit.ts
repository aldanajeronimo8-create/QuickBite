const WHITE_RGB_VALUES = new Set(['rgb(255, 255, 255)', 'rgba(255, 255, 255, 1)']);

function isSurfaceCandidate(element: HTMLElement): boolean {
  if (element.closest('[data-qb-theme-audit-ignore]')) return false;
  const tag = element.tagName.toLowerCase();
  if (tag === 'svg' || tag === 'path' || tag === 'img' || tag === 'video' || tag === 'canvas') return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 24 && rect.height > 16;
}

export function findAccidentalWhiteSurfaces(root: ParentNode = document): HTMLElement[] {
  const offenders: HTMLElement[] = [];
  if (typeof document === 'undefined') return offenders;
  root.querySelectorAll<HTMLElement>('*').forEach((element) => {
    if (!isSurfaceCandidate(element)) return;
    const background = window.getComputedStyle(element).backgroundColor;
    if (WHITE_RGB_VALUES.has(background)) offenders.push(element);
  });
  return offenders;
}

export function installDarkSurfaceAudit(): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined' || document.documentElement.dataset.qbTheme !== 'dark') return () => undefined;

  let scheduled = false;
  let stopped = false;
  const run = () => {
    scheduled = false;
    if (stopped || document.documentElement.dataset.qbTheme !== 'dark') return;
    const offenders = findAccidentalWhiteSurfaces(document);
    if (!offenders.length) return;
    const preview = offenders.slice(0, 12).map((element) => ({ tag: element.tagName.toLowerCase(), className: element.className, text: (element.textContent ?? '').trim().slice(0, 80) }));
    console.warn('[QuickBite ThemeAudit] White UI surfaces detected in dark mode. Replace literal surface colors with semantic tokens.', preview);
  };
  const schedule = () => {
    if (scheduled || stopped) return;
    scheduled = true;
    const idle = (window as Window & { requestIdleCallback?: (callback: () => void) => number }).requestIdleCallback;
    if (idle) idle(run);
    else window.setTimeout(run, 120);
  };

  const observer = new MutationObserver(schedule);
  observer.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class', 'style'] });
  schedule();
  return () => {
    stopped = true;
    observer.disconnect();
  };
}
