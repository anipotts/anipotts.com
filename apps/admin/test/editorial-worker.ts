import { EditorialDraftStore } from "../src/editorial/draft-store";
export { EditorialDraftStore };
export class DirectEditorialDraftStore extends EditorialDraftStore {
  constructor(ctx: DurableObjectState, env: object) {
    super(ctx, {
      ...env,
      EDITORIAL_ENABLED: "true",
      EDITORIAL_PUBLISH_ENABLED: "true",
    });
  }
}
/** The kill switch: publishing off, with no media binding either. */
export class DisabledEditorialDraftStore extends EditorialDraftStore {
  constructor(ctx: DurableObjectState, env: object) {
    super(ctx, {
      ...env,
      CONTENT_MEDIA: undefined,
      EDITORIAL_ENABLED: "true",
      EDITORIAL_PUBLISH_ENABLED: "false",
    });
  }
}

export default {
  fetch() {
    return new Response(null, { status: 404 });
  },
};
