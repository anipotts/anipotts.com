import type { APIRoute } from "astro";

export const prerender = false;

/** Keep legacy consumers on the same white-on-blue mark in every theme. */
export const GET: APIRoute = ({ url }) => {
  return Response.redirect(
    new URL("/brand/ap-favicon.svg?v=20260908", url),
    307,
  );
};
