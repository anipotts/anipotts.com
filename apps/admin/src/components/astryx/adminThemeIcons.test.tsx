// @vitest-environment jsdom
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SidebarSimpleIcon, XIcon } from "@phosphor-icons/react";
import { adminThemeIcons, NavigationIconScope } from "./adminThemeIcons";

describe("navigation close icon scope", () => {
  it("matches the opener only inside navigation and keeps other close icons", () => {
    const standard = renderToStaticMarkup(adminThemeIcons.close);
    expect(standard).toBe(
      renderToStaticMarkup(<XIcon size="1em" aria-hidden="true" />),
    );
    expect(
      renderToStaticMarkup(
        <NavigationIconScope value>
          {adminThemeIcons.close}
        </NavigationIconScope>,
      ),
    ).toBe(
      renderToStaticMarkup(
        <SidebarSimpleIcon size="1em" weight="regular" aria-hidden="true" />,
      ),
    );
    expect(renderToStaticMarkup(adminThemeIcons.close)).toBe(standard);
  });
});
