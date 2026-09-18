import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App';
import { startThemeAudit } from './lib/themeAuditBootstrap';

// Boot the public/login experience from the last explicitly resolved QuickBite
// theme. This prevents the operating system from forcing a dark login before
// VisualThemeProvider restores the authenticated account preference.
if (typeof document !== 'undefined') {
  const storedTheme = window.localStorage.getItem('quickbite_last_theme_preference_v2');
  const initialTheme = storedTheme === 'dark' || storedTheme === 'light'
    ? storedTheme
    : 'light';
  document.documentElement.dataset.qbTheme = initialTheme;
  document.documentElement.dataset.qbAppearancePreference = initialTheme;
  document.documentElement.classList.toggle('dark', initialTheme === 'dark');
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
