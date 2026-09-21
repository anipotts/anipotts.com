import { EditorialDraftStore } from "../src/editorial/draft-store";
export { EditorialDraftStore };
export class DirectEditorialDraftStore extends EditorialDraftStore {
  constructor(ctx: DurableObjectState, env: object) {
    super(ctx, {
      ...env,
      EDITORIAL_PUBLISH_MODE: "direct",
      EDITORIAL_ENABLED: "true",
      EDITORIAL_PUBLISH_ENABLED: "true",
    });
  }
}
export class MaintenanceEditorialDraftStore extends EditorialDraftStore {
  constructor(ctx: DurableObjectState, env: object) {
    super(ctx, {
      ...env,
      CONTENT_MEDIA: undefined,
      EDITORIAL_PUBLISH_MODE: "maintenance",
    });
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
