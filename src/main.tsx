import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App';
import { startThemeAudit } from './lib/themeAuditBootstrap';

// Boot the anonymous experience from the device appearance. Once a user is
// authenticated, VisualThemeProvider replaces this with the account preference.
if (typeof document !== 'undefined') {
  const prefersDark = window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  const initialTheme = prefersDark ? 'dark' : 'light';
  document.documentElement.dataset.qbTheme = initialTheme;
  document.documentElement.dataset.qbAppearancePreference = 'system';
  document.documentElement.classList.toggle('dark', prefersDark);
  document.documentElement.style.colorScheme = initialTheme;
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
