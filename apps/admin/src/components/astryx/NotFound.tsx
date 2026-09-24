import React from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { MapTrifoldIcon, SquaresFourIcon } from "@phosphor-icons/react";
import { StateNotice } from "../workspace/Workspace";

/** The one not-found page, inside the shell so every way out stays in view.
 * Routes that reject a path answer with `Astro.rewrite("/404")`. */
export function NotFound() {
  return (
    <section className="admin-not-found" aria-labelledby="admin-not-found">
      <Heading level={1} className="sr-only" id="admin-not-found">
        Not found
      </Heading>
      <StateNotice
        kind="empty"
        icon={MapTrifoldIcon}
        title="Nothing at this address"
        action={
          <Button
            href="/"
            label="Overview"
            icon={<SquaresFourIcon size={18} aria-hidden="true" />}
          />
        }
      />
    </section>
  );
}
