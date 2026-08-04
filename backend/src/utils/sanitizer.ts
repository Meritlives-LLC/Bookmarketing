export function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, '');
}

export function sanitizeString(input: unknown): string {
  if (typeof input !== 'string') return '';
  return stripHtml(input.trim());
}

export function sanitizeEmail(input: string): string {
  return input.trim().toLowerCase();
}

export function sanitizeObject<T extends Record<string, unknown>>(obj: T): T {
  const result = { ...obj };
  for (const key of Object.keys(result)) {
    const value = result[key];
    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(value);
    }
  }
  return result;
}
