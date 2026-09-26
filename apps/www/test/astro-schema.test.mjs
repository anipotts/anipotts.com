import assert from "node:assert/strict";
import test from "node:test";
import { z } from "zod";
import { astroSchema as publicSchema } from "../src/lib/astro-schema.ts";
import { astroSchema as adminSchema } from "../../admin/src/lib/astro-schema.ts";

for (const [name, adapt] of [
  ["public", publicSchema],
  ["admin", adminSchema],
]) {
  test(`${name}: schema bridge retains validation, defaults and transformations`, () => {
    const original = z
      .object({ title: z.string().min(3), count: z.number().default(2) })
      .refine((value) => value.title !== "forbidden", {
        message: "reserved title",
        path: ["title"],
      })
      .transform((value) => ({ ...value, title: value.title.trim() }));
    const adapted = adapt(original);
    assert.deepEqual(
      adapted.parse({ title: " hello " }),
      original.parse({ title: " hello " }),
    );
    for (const input of [
      { title: "x" },
      { title: "forbidden" },
      { title: 42 },
      { title: "valid", count: "2" },
    ]) {
      const expected = original.safeParse(input);
      const actual = adapted.safeParse(input);
      assert.equal(actual.success, false);
      assert.deepEqual(
        actual.error.issues.map(({ path, message }) => ({ path, message })),
        expected.error.issues.map(({ path, message }) => ({ path, message })),
      );
    }
  });
}
