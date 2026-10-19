export const ROLES = {
  GUEST: "CONVIDADO",
  INTIMATE: "INTIMO",
  ADMIN: "ADMIN",
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];