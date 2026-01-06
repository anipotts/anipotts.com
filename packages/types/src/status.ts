export type ServiceStatusState = "operational" | "degraded" | "down" | "maintenance";

export interface ServiceStatus {
  name: string;
  url: string;
  status: ServiceStatusState;
  latency?: number;
  lastChecked: string;
  uptime?: number; // percentage over last 30 days
}

export interface StatusPageData {
  services: ServiceStatus[];
  lastUpdated: string;
  overallStatus: ServiceStatusState;
}
