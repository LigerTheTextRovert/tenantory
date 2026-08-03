export interface JwtPayload {
  sub: string;
  tenantId: string;
  email: string;
  role: string;
  iat?: number; // Issued at
  exp?: number; // Expiration
}
