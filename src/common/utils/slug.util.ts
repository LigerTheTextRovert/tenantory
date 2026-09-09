export function generateSlug(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD') // Decompose Unicode (é → e + accent)
    .replace(/[\u0300-\u036f]/g, '') // Strip accent marks
    .replace(/[^a-z0-9\s-]/g, '') // Remove non-alphanumeric (keep spaces, hyphens)
    .replace(/[\s]+/g, '-') // Spaces → hyphens
    .replace(/-{2,}/g, '-') // Collapse consecutive hyphens
    .replace(/^-+|-+$/g, ''); // Trim leading/trailing hyphens
}
