import type { AuthenticatedPrincipal } from "./auth";

declare module "express-session" {
  interface SessionData {
    principal?: AuthenticatedPrincipal;
  }
}

declare module "connect-pg-simple";