export function getErrorMessage(error: unknown, fallback = 'No se pudo completar la operación.') {
  const message = error instanceof Error ? error.message : String(error ?? '');

  if (/not_authorized|permission denied|row-level security/i.test(message)) {
    return 'No tienes permisos para realizar esta acción.';
  }
  if (/insufficient_loyalty_points/i.test(message)) {
    return 'No tienes puntos suficientes para canjear este premio.';
  }
  if (/reward_unavailable|reward_out_of_stock/i.test(message)) {
    return 'Este premio ya no está disponible.';
  }
  if (/loyalty_disabled/i.test(message)) {
    return 'El programa de puntos está desactivado por el momento.';
  }
  if (/relation .* does not exist|schema cache/i.test(message)) {
    return 'La configuración aún no está disponible. Aplica la migración de Supabase.';
  }

  return message || fallback;
}
