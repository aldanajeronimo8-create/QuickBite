type ErrorPayload = {
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  message?: unknown;
};

function isErrorPayload(value: unknown): value is ErrorPayload {
  return typeof value === 'object' && value !== null;
}

function nonEmptyString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

export function getErrorMessage(error: unknown, fallback = 'Ocurrio un error inesperado.') {
  if (typeof error === 'string' && error.trim()) return error.trim();
  if (error instanceof Error && error.message.trim()) return error.message.trim();

  if (isErrorPayload(error)) {
    return (
      nonEmptyString(error.message) ??
      nonEmptyString(error.details) ??
      nonEmptyString(error.hint) ??
      nonEmptyString(error.code) ??
      fallback
    );
  }

  return fallback;
}
