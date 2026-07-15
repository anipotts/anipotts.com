import {
  findAdminProjectState,
  loadAdminControlSnapshot,
} from "@anipotts/lib/admin-control";

export async function GET({
  locals,
  request,
}: {
  locals: App.Locals;
  request: Request;
}) {
  const snapshot = await loadAdminControlSnapshot(locals.runtime?.env.DB);
  const url = new URL(request.url);
  const projectId =
    url.searchParams.get("project_id") ?? url.searchParams.get("id");

  if (projectId) {
    const project = findAdminProjectState(snapshot, projectId);
    if (!project) {
      return Response.json(
        { error: "project_not_found", project_id: projectId },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(project, {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  return Response.json(snapshot.projections.project_states, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
