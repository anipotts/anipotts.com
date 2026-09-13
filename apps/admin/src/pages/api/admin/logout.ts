import type { APIRoute } from "astro";
import { adminLogout } from "../../../lib/admin-logout";

export const ALL: APIRoute = (context) => adminLogout(context);
