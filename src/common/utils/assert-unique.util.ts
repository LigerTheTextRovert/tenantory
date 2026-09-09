export function isUniqueViolation(err: unknown): boolean {
  if (
    err instanceof Error &&
    'code' in err &&
    (err as Error & { code: string }).code === '23505'
  ) {
    return true;
  }
  return false;
}
