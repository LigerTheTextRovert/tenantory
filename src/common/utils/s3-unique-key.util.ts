import { extname } from 'path';

export function generateUniqueKey(tenantId: string, fileName: string) {
  return `${crypto.randomUUID()}-${tenantId}/${extname(fileName)}`;
}
