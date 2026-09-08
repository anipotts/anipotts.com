/// <reference types="astro/client" />

type CfEnv = {
  ASSETS: Fetcher;
  NEWSLETTER?: Fetcher;
};

type Runtime = import("@astrojs/cloudflare").Runtime<CfEnv>;

interface Window {
  posthog?: {
    capture?: (event: string, properties?: Record<string, unknown>) => void;
  };
}

declare namespace App {
  interface Locals extends Runtime {}
}
