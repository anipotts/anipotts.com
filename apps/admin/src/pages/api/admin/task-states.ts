import {
  findAdminTaskState,
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
    const task = findAdminTaskState(snapshot, taskId);
    if (!task) {
      return Response.json(
        { error: "task_not_found", task_id: taskId },
        { status: 404, headers: { "cache-control": "no-store" } },
      );
    }
    return Response.json(task, {
      headers: {
        "cache-control": "no-store",
      },
    });
  }

  return Response.json(snapshot.projections.task_states, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
