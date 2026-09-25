import { z } from "astro/zod";

// Adapt shared Zod 3 validators without changing their defaults or refinements.
export function astroSchema<T>(schema: {
  safeParse(value: unknown):
    | { success: true; data: T }
    | {
        success: false;
        error: { issues: { message: string; path: (string | number)[] }[] };
      };
}) {
  return z.unknown().transform((value, ctx) => {
    const result = schema.safeParse(value);
    if (result.success) return result.data;
    for (const issue of result.error.issues) {
      ctx.addIssue({
        code: "custom",
        message: issue.message,
        path: issue.path,
      });
    }
    return z.NEVER;
  });
}
