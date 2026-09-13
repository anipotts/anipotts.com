/// <reference types="astro/client" />

type D1PreparedStatement = {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = unknown>(): Promise<T | null>;
  run(): Promise<{ results?: unknown[]; success?: boolean; meta?: unknown }>;
  all<T = unknown>(): Promise<{ results?: T[] }>;
};

type D1Database = {
  prepare(query: string): D1PreparedStatement;
  batch(
    statements: D1PreparedStatement[],
  ): Promise<Array<{ results?: unknown[]; success?: boolean; meta?: unknown }>>;
};

type CommandRelayStub = {
  submitCommand(
    command: import("@anipotts/types").ControlCommandSubmission,
  ): Promise<import("@anipotts/types").ControlCommandRecord>;
  getSnapshot(
    limit?: number,
  ): Promise<import("@anipotts/types").ControlPlaneSnapshot>;
};

type CommandRelayNamespace = {
  getByName(name: string): CommandRelayStub;
};

type AppBindingRuntime = {
  runtime: {
    env: {
      DB: D1Database;
      COMMAND_RELAY: CommandRelayNamespace;
      PUBLIC_STATE_API: string;
      ACCESS_TEAM_DOMAIN: string;
      ACCESS_POLICY_AUD: string;
      ADMIN_PASSWORD_HASH?: string;
      ADMIN_GOOGLE_CLIENT_ID?: string;
      ADMIN_GOOGLE_CLIENT_SECRET?: string;
      ADMIN_SECURITY_ALERT_TO?: string;
      ADMIN_SECURITY_ALERT_FROM?: string;
      ADMIN_SECURITY_ALERTS_ENABLED?: string;
      RESEND_API_KEY?: string;
    };
  };
};

declare namespace App {
  interface Locals extends AppBindingRuntime {
    passkeySessionActive?: boolean;
    adminPrincipal?: import("./lib/admin-auth").AdminPrincipal;
    adminSetCookies?: string[];
  }
}

// Keep Worker binding access typed without replacing browser DOM globals.
declare module "cloudflare:workers" {
  export const env: AppBindingRuntime["runtime"]["env"];
}
