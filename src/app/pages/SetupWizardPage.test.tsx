import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { VisualThemeProvider } from '../contexts/VisualThemeProvider';
import { SetupWizardPage } from './SetupWizardPage';

describe('SetupWizardPage', () => {
  it('explains the required first-run configuration', () => {
    render(
      <VisualThemeProvider>
        <SetupWizardPage />
      </VisualThemeProvider>,
    );

    expect(screen.getByRole('heading', { name: /configuración inicial/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'QuickBite' })).toBeInTheDocument();
    expect(screen.getByText(/conectar un proyecto supabase existente/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL/i)).toBeInTheDocument();
  });
});
