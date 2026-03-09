/**
 * Unified shared types entrypoint.
 */

export type AuthUser = {
  id: string;
  email: string | null;
  name: string | null;
  phone?: string | null;
  company?: string | null;
  role?: string | null;
};

export * from "./_core/errors";
