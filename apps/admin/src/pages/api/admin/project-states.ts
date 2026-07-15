import { loadAdminControlSnapshot } from "@anipotts/lib/admin-control";

export async function GET({ locals }: { locals: App.Locals }) {
  const snapshot = await loadAdminControlSnapshot(locals.runtime?.env.DB);

  return Response.json(snapshot.projections.project_states, {
    headers: {
      "cache-control": "no-store",
    },
  });
}
