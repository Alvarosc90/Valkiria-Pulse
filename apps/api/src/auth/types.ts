export type PulseRole = "owner" | "admin" | "editor" | "viewer";

export interface AuthContext {
  userId: string;
  tenantId: string;
  role: PulseRole;
  user: {
    email: string;
    displayName: string;
  };
  tenant: {
    name: string;
    slug: string;
  };
}
