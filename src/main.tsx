import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App';
import { startThemeAudit } from './lib/themeAuditBootstrap';

// Boot default: before authentication there is no account preference, so the
// login/register experience must always start in QuickBite's original light theme.
// Account-specific dark/system preferences are applied later by VisualThemeProvider.
if (typeof document !== 'undefined') {
  document.documentElement.dataset.qbTheme = 'light';
  document.documentElement.dataset.qbAppearancePreference = 'light';
  document.documentElement.classList.remove('dark');
  document.documentElement.style.colorScheme = 'light';
}

const stopThemeAudit = startThemeAudit();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopThemeAudit());
}
