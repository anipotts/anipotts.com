import type { AdminControlProjections, AdminControlSnapshot } from "./types";
import {
  filterAdminTaskLineage,
  findAdminProjectState,
  findAdminTaskState,
} from "./queries";

export type McpJsonRpcRequest = {
  jsonrpc?: "2.0";
  id?: string | number | null;
  method?: string;
  params?: unknown;
};

export const ADMIN_MCP_RESOURCE_URIS = [
  "admin://projections/inbox_items",
  "admin://projections/project_states",
  "admin://projections/task_states",
  "admin://projections/task_lineage",
  "admin://projections/piece_states",
  "admin://projections/fleet_status",
  "admin://projections/deploy_states",
  "admin://projections/capability_states",
  "admin://projections/service_registry_view",
  "admin://projects/{project_id}",
  "admin://tasks/{task_id}",
  "admin://contracts/event",
] as const;

export const ADMIN_MCP_TOOL_NAMES = [
  "admin.get_projection",
  "admin.get_inbox",
  "admin.get_projects",
  "admin.get_project",
  "admin.get_tasks",
  "admin.get_task",
  "admin.get_task_lineage",
  "admin.get_capabilities",
] as const;

const PROJECTION_NAMES = [
  "inbox_items",
  "project_states",
  "task_states",
  "task_lineage",
  "piece_states",
  "fleet_status",
  "deploy_states",
  "capability_states",
  "service_registry_view",
] as const satisfies readonly ProjectionName[];

type ProjectionName = keyof AdminControlProjections;

export function adminMcpManifest(snapshot: AdminControlSnapshot) {
  return {
    name: "admin.anipotts.com",
    version: "0.1.0",
    mode: "read-only",
    schema_version: snapshot.schema_version,
    auth: snapshot.auth.mcp,
    write_tools: snapshot.auth.write_tools,
    resources: ADMIN_MCP_RESOURCE_URIS,
    tools: ADMIN_MCP_TOOL_NAMES,
  };
}

export function handleAdminMcpRequest(
  snapshot: AdminControlSnapshot,
  request: McpJsonRpcRequest,
) {
  const id = request.id ?? null;

  switch (request.method) {
    case "initialize":
      return result(id, {
        protocolVersion: "2025-06-18",
        serverInfo: {
          name: "admin.anipotts.com",
          version: "0.1.0",
        },
        capabilities: {
          resources: {},
          tools: {},
        },
      });

    case "resources/list":
      return result(id, {
        resources: ADMIN_MCP_RESOURCE_URIS.map((uri) => ({
          uri,
          name: uri.replace("admin://", ""),
          mimeType: "application/json",
        })),
      });

    case "resources/read": {
      const uri = readStringParam(request.params, "uri");
      const value = resourceValue(snapshot, uri);
      if (value == null) return error(id, -32602, `unknown resource: ${uri}`);
      return result(id, {
        contents: [
          {
            uri,
            mimeType: "application/json",
            text: JSON.stringify(value, null, 2),
          },
        ],
      });
    }

    case "tools/list":
      return result(id, {
        tools: [
          {
            name: "admin.get_projection",
            description: "read one admin projection by name",
            inputSchema: projectionInputSchema(),
          },
          {
            name: "admin.get_inbox",
            description: "read current inbox cards",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "admin.get_projects",
            description: "read current project states",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "admin.get_project",
            description: "read one project state by project_id or project_key",
            inputSchema: idInputSchema("project_id"),
          },
          {
            name: "admin.get_tasks",
            description: "read current task states",
            inputSchema: { type: "object", properties: {} },
          },
          {
            name: "admin.get_task",
            description: "read one task state by task_id",
            inputSchema: idInputSchema("task_id"),
          },
          {
            name: "admin.get_task_lineage",
            description:
              "read current task lineage, optionally scoped by task_id",
            inputSchema: optionalIdInputSchema("task_id"),
          },
          {
            name: "admin.get_capabilities",
            description: "read machine capability states",
            inputSchema: { type: "object", properties: {} },
          },
        ],
      });

    case "tools/call":
      return callTool(snapshot, id, request.params);

    default:
      return error(id, -32601, `unknown method: ${request.method ?? ""}`);
  }
}

function callTool(
  snapshot: AdminControlSnapshot,
  id: string | number | null,
  params: unknown,
) {
  const toolName = readStringParam(params, "name");
  const args = readObjectParam(params, "arguments");

  if (toolName === "admin.get_inbox") {
    return toolResult(id, snapshot.projections.inbox_items);
  }

  if (toolName === "admin.get_projects") {
    return toolResult(id, snapshot.projections.project_states);
  }

  if (toolName === "admin.get_project") {
    const projectId =
      readStringParam(args, "project_id") || readStringParam(args, "id");
    const project = findAdminProjectState(snapshot, projectId);
    return project
      ? toolResult(id, project)
      : error(id, -32602, `unknown project: ${projectId}`);
  }

  if (toolName === "admin.get_tasks") {
    return toolResult(id, snapshot.projections.task_states);
  }

  if (toolName === "admin.get_task") {
    const taskId =
      readStringParam(args, "task_id") || readStringParam(args, "id");
    const task = findAdminTaskState(snapshot, taskId);
    return task
      ? toolResult(id, task)
      : error(id, -32602, `unknown task: ${taskId}`);
  }

  if (toolName === "admin.get_task_lineage") {
    const taskId =
      readStringParam(args, "task_id") || readStringParam(args, "id");
    return toolResult(
      id,
      taskId.length > 0
        ? filterAdminTaskLineage(snapshot, taskId)
        : snapshot.projections.task_lineage,
    );
  }

  if (toolName === "admin.get_capabilities") {
    return toolResult(id, snapshot.projections.capability_states);
  }

  if (toolName === "admin.get_projection") {
    const projection = readStringParam(args, "projection") as ProjectionName;
    if (!isProjectionName(projection)) {
      return error(id, -32602, `unknown projection: ${projection}`);
    }
    return toolResult(id, snapshot.projections[projection]);
  }

  return error(id, -32602, `unknown read-only tool: ${toolName}`);
}

function toolResult(id: string | number | null, value: unknown) {
  return result(id, {
    content: [
      {
        type: "text",
        text: JSON.stringify(value, null, 2),
      },
    ],
  });
}

function resourceValue(snapshot: AdminControlSnapshot, uri: string) {
  if (uri === "admin://contracts/event") {
    return {
      schema_version: snapshot.schema_version,
      contracts: snapshot.contracts,
      sync: snapshot.sync,
      retention: snapshot.retention,
      auth: snapshot.auth,
    };
  }

  const prefix = "admin://projections/";
  if (uri.startsWith(prefix)) {
    const projection = uri.slice(prefix.length) as ProjectionName;
    return isProjectionName(projection)
      ? snapshot.projections[projection]
      : null;
  }

  const projectPrefix = "admin://projects/";
  if (uri.startsWith(projectPrefix)) {
    return findAdminProjectState(snapshot, uri.slice(projectPrefix.length));
  }

  const taskPrefix = "admin://tasks/";
  if (uri.startsWith(taskPrefix)) {
    return findAdminTaskState(snapshot, uri.slice(taskPrefix.length));
  }

  return null;
}

function isProjectionName(value: string): value is ProjectionName {
  return (PROJECTION_NAMES as readonly string[]).includes(value);
}

function projectionInputSchema() {
  return {
    type: "object",
    properties: {
      projection: {
        type: "string",
        enum: PROJECTION_NAMES,
      },
    },
    required: ["projection"],
  };
}

function idInputSchema(name: string) {
  return {
    type: "object",
    properties: {
      [name]: { type: "string" },
      id: { type: "string" },
    },
    anyOf: [{ required: [name] }, { required: ["id"] }],
  };
}

function optionalIdInputSchema(name: string) {
  return {
    type: "object",
    properties: {
      [name]: { type: "string" },
      id: { type: "string" },
    },
  };
}

function result(id: string | number | null, value: unknown) {
  return { jsonrpc: "2.0", id, result: value };
}

function error(id: string | number | null, code: number, message: string) {
  return { jsonrpc: "2.0", id, error: { code, message } };
}

function readStringParam(params: unknown, key: string): string {
  if (!params || typeof params !== "object") return "";
  const value = (params as Record<string, unknown>)[key];
  return typeof value === "string" ? value : "";
}

function readObjectParam(
  params: unknown,
  key: string,
): Record<string, unknown> {
  if (!params || typeof params !== "object") return {};
  const value = (params as Record<string, unknown>)[key];
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}
