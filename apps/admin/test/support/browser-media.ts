/** Deterministic jsdom media support, not touch/device emulation. Width/height
 * follow the test's window; the default input capability is fine + hover.
 * Cover both classic min/max queries and Core 0.7's strict MQ4 width ranges. */
export function matchesBrowserMedia(query: string, view: Window): boolean {
  return query.split(",").some((input) => {
    const negative = /^\s*not\s+/i.test(input);
    const branch = input.replace(/^\s*not\s+/i, "");
    const features = [...branch.matchAll(/\(([^()]*)\)/g)].map((item) =>
      item[1]!.trim(),
    );
    const media = branch
      .replace(/\([^()]*\)/g, "")
      .replace(/\band\b/gi, "")
      .trim();
    let result = !media || media === "screen" || media === "all";
    result &&= features.every((feature) => {
      const classic =
        /^(min|max)-(width|height):\s*(\d+(?:\.\d+)?)(px|rem|em)$/i.exec(
          feature,
        );
      if (classic) {
        const actual =
          classic[2] === "width" ? view.innerWidth : view.innerHeight;
        const boundary = Number(classic[3]) * (classic[4] === "px" ? 1 : 16);
        return classic[1] === "min" ? actual >= boundary : actual <= boundary;
      }
      const range =
        /^(width|height)\s*(<=|>=|<|>|=)\s*(\d+(?:\.\d+)?)(px|rem|em)$/i.exec(
          feature,
        );
      if (range) {
        const actual =
          range[1] === "width" ? view.innerWidth : view.innerHeight;
        const boundary = Number(range[3]) * (range[4] === "px" ? 1 : 16);
        switch (range[2]) {
          case "<":
            return actual < boundary;
          case "<=":
            return actual <= boundary;
          case ">":
            return actual > boundary;
          case ">=":
            return actual >= boundary;
          default:
            return actual === boundary;
        }
      }
      const preference = feature.replace(/\s+/g, "");
      return [
        "pointer:fine",
        "any-pointer:fine",
        "hover:hover",
        "any-hover:hover",
        "prefers-reduced-motion:no-preference",
        "prefers-color-scheme:light",
        "forced-colors:none",
      ].includes(preference);
    });
    return negative ? !result : result;
  });
}

export function browserMedia(view: Window) {
  class Query extends EventTarget implements MediaQueryList {
    readonly media: string;
    onchange: MediaQueryList["onchange"] = null;
    #last: boolean;
    constructor(query: string) {
      super();
      this.media = query;
      this.#last = this.matches;
    }
    get matches() {
      return matchesBrowserMedia(this.media, view);
    }
    addListener(listener: Parameters<MediaQueryList["addListener"]>[0]) {
      if (listener) this.addEventListener("change", listener as EventListener);
    }
    removeListener(listener: Parameters<MediaQueryList["removeListener"]>[0]) {
      if (listener)
        this.removeEventListener("change", listener as EventListener);
    }
    resized() {
      const matches = this.matches;
      if (matches === this.#last) return;
      this.#last = matches;
      const event: MediaQueryListEvent = Object.assign(new Event("change"), {
        matches,
        media: this.media,
      });
      this.dispatchEvent(event);
      this.onchange?.call(this, event);
    }
  }
  const queries = new Map<string, Query>();
  const resize = () => {
    for (const query of queries.values()) query.resized();
  };
  view.addEventListener("resize", resize);
  return {
    matchMedia(query: string): MediaQueryList {
      let value = queries.get(query);
      if (!value) {
        value = new Query(query);
        queries.set(query, value);
      }
      return value;
    },
    dispose() {
      view.removeEventListener("resize", resize);
      queries.clear();
    },
  };
}
