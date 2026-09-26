import type { APIRoute } from "astro";
import { privateJson } from "../../../lib/editorial-security";
import {
  PRIVATE_READER_MODES,
  privateReaderCredentialApi,
  type PrivateReaderMode,
} from "../../../lib/private-reader-credential";
import { runtimeEnv } from "../../../lib/runtime-env";

const modes = Object.keys(PRIVATE_READER_MODES) as PrivateReaderMode[];

/** Data (`credential`), Observability (`ops-credential`) and Health
 * (`health-credential`) issuance. Each path carries its own fixed scope and
 * switch; middleware already verified the owner. */
export const ALL: APIRoute = async ({ request, locals, url }) => {
  const mode = modes.find(
    (name) => PRIVATE_READER_MODES[name].path === url.pathname,
  );
  if (!mode) return privateJson({ error: "not_found" }, 404);
  try {
    return await privateReaderCredentialApi(
      request,
      runtimeEnv(),
      { owner: locals.accessOwner },
      mode,
    );
  } catch {
    return privateJson({ error: "reader_unavailable" }, 503);
  }
};
