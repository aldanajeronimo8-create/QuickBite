import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock('@/lib/supabaseClient', () => ({
  requireSupabaseClient: () => ({ rpc: rpcMock }),
}));

import StudentOrderWindows from './StudentOrderWindows';

function renderPage(responses: Record<string, { data: unknown; error: unknown }>) {
  rpcMock.mockImplementation(async (name: string) => responses[name] ?? { data: null, error: null });
  return render(
    <MemoryRouter>
      <StudentOrderWindows />
    </MemoryRouter>,
  );
}

describe('StudentOrderWindows', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it('prioritizes the section recess schedule and never displays general pickup windows over it', async () => {
    renderPage({
      get_student_preorder_options: {
        data: [{
          recess_schedule_id: 'recess-1',
          name: 'Primer Descanso',
          start_time: '09:20:00',
          end_time: '09:35:00',
          pickup_date: '2026-10-20',
          preorders_count: 8,
          max_preorders: 40,
          is_active: true,
          can_order: true,
          window_open: true,
          waitlist_status: null,
          waitlist_position: null,
          offer_expires_at: null,
          server_now: '2026-10-20T14:25:00Z',
        }],
        error: null,
      },
    });

    expect(await screen.findByText('Tus pedidos se rigen por los recreos de tu sección')).toBeInTheDocument();
    expect(screen.getByText('Primer Descanso')).toBeInTheDocument();
    expect(screen.getAllByText('Puedes pedir ahora').length).toBeGreaterThan(0);
    expect(screen.getByText('8 / 40')).toBeInTheDocument();
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith('get_student_preorder_options');
    expect(rpcMock).not.toHaveBeenCalledWith('get_order_window_status');
    expect(rpcMock).not.toHaveBeenCalledWith('get_order_windows_enabled');
  });

  it('shows general pickup slots only when no recess applies and the global restriction is enabled', async () => {
    renderPage({
      get_student_preorder_options: { data: [], error: null },
      get_order_windows_enabled: { data: true, error: null },
      get_order_window_status: {
        data: [{
          slot_id: 'slot-1',
          slot_name: 'Ventana general',
          starts_at: '00:00:00',
          ends_at: '23:59:00',
          enabled: true,
          max_orders: 40,
          orders_count: 3,
          accepting_orders: true,
        }],
        error: null,
      },
    });

    expect(await screen.findByText('Tus pedidos se rigen por las ventanas generales de cafetería')).toBeInTheDocument();
    expect(screen.getByText('Ventana general')).toBeInTheDocument();
    expect(screen.getByText('Puedes pedir ahora')).toBeInTheDocument();
    expect(screen.getByText('3 / 40')).toBeInTheDocument();
  });

  it('does not show irrelevant configured slots when both section recesses and global restrictions are inactive', async () => {
    renderPage({
      get_student_preorder_options: { data: [], error: null },
      get_order_windows_enabled: { data: false, error: null },
      get_order_window_status: {
        data: [{
          slot_id: 'old-slot',
          slot_name: 'Horario antiguo',
          starts_at: '09:20:00',
          ends_at: '09:35:00',
          enabled: true,
          max_orders: 40,
          orders_count: 0,
          accepting_orders: false,
        }],
        error: null,
      },
    });

    expect(await screen.findByText('No tienes una restricción de horario activa')).toBeInTheDocument();
    expect(screen.getByText(/Puedes realizar un pedido desde el menú sin esperar una ventana/)).toBeInTheDocument();
    expect(screen.queryByText('Horario antiguo')).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalledWith('get_order_window_status');
  });

  it('fails closed in the information screen if the governing schedule cannot be queried', async () => {
    renderPage({
      get_student_preorder_options: { data: null, error: new Error('permission denied') },
    });

    await waitFor(() => expect(screen.getByRole('alert')).toBeInTheDocument());
    expect(screen.getByText('No mostramos horarios que no podamos confirmar')).toBeInTheDocument();
    expect(screen.queryByText('Puedes pedir sin restricción de horario')).not.toBeInTheDocument();
    expect(rpcMock).not.toHaveBeenCalledWith('get_order_windows_enabled');
  });
});
