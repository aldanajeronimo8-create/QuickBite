import React from 'react';
import { createRoot } from 'react-dom/client';
import './styles/index.css';
import App from './app/App';
import { startThemeAudit } from './lib/themeAuditBootstrap';

const stopThemeAudit = startThemeAudit();

createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);

if (import.meta.hot) {
  import.meta.hot.dispose(() => stopThemeAudit());
}
