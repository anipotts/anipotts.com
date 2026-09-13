import { handle } from "@astrojs/cloudflare/handler";
export { EditorialDraftStore } from "./editorial/draft-store";

export default { fetch: handle };
