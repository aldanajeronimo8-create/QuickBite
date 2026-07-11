import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SetupWizardPage } from './SetupWizardPage';

describe('SetupWizardPage', () => {
  it('explains the required first-run configuration', () => {
    render(<SetupWizardPage />);

    expect(screen.getByRole('heading', { name: /configuracion inicial/i })).toBeInTheDocument();
    expect(screen.getByText(/conectar un proyecto supabase existente/i)).toBeInTheDocument();
    expect(screen.getByText(/VITE_SUPABASE_URL/i)).toBeInTheDocument();
  });
});
