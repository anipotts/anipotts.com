import {
  filterAdminTaskLineage,
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
  const taskId = url.searchParams.get("task_id") ?? url.searchParams.get("id");

  if (taskId) {
    return Response.json(filterAdminTaskLineage(snapshot, taskId), {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  return Response.json(snapshot.projections.task_lineage, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
