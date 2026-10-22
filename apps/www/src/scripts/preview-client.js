export function mountProjectMedia() {
  document.querySelectorAll("[data-project-media]").forEach((stage) => {
    if (stage.dataset.mounted) return;
    stage.dataset.mounted = "true";
    const panels = [...stage.querySelectorAll("[data-media-panel]")];
    const choices = [...stage.querySelectorAll("[data-media-choice]")];
    const caption = stage.querySelector("[data-media-figcaption]");
    choices.forEach((choice, index) => {
      choice.addEventListener("click", () => {
        panels.forEach((panel, panelIndex) => {
          panel.hidden = panelIndex !== index;
          if (panel.hidden) panel.querySelector("video")?.pause();
        });
        choices.forEach((candidate, choiceIndex) => {
          candidate.setAttribute("aria-pressed", String(choiceIndex === index));
        });
        if (caption) caption.textContent = choice.dataset.mediaCaption ?? "";
      });
    });
    const dialog = stage.querySelector("[data-image-viewer]");
    const image = dialog?.querySelector("[data-viewer-image]");
    const zoom = dialog?.querySelector("[data-image-zoom]");
    const original = dialog?.querySelector("[data-image-original]");
    const description = dialog?.querySelector("[data-image-description]");
    const canvas = dialog?.querySelector(".image-viewer__canvas");
    if (!dialog || !image || !zoom || !original || !canvas) return;
    stage.querySelectorAll("[data-media-enlarge]").forEach((link) => {
      link.addEventListener("click", (event) => {
        if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)
          return;
        if (typeof dialog.showModal !== "function") return;
        event.preventDefault();
        image.src = link.href;
        image.alt = link.dataset.mediaAlt ?? "";
        original.href = link.href;
        if (description) description.textContent = image.alt;
        dialog.dataset.zoomed = "false";
        zoom.setAttribute("aria-pressed", "false");
        dialog.showModal();
        dialog
          .querySelector("[data-image-close]")
          ?.focus({ preventScroll: true });
        canvas.scrollTo(0, 0);
      });
    });
    zoom.addEventListener("click", () => {
      const zoomed = dialog.dataset.zoomed !== "true";
      dialog.dataset.zoomed = String(zoomed);
      // The "actual size" name stays fixed; aria-pressed alone reports the zoom.
      zoom.setAttribute("aria-pressed", String(zoomed));
      canvas.scrollTo(0, 0);
      canvas.focus();
    });
    dialog
      .querySelector("[data-image-close]")
      ?.addEventListener("click", () => dialog.close());
    dialog.addEventListener("click", (event) => {
      if (event.target !== dialog) return;
      const box = dialog.getBoundingClientRect();
      if (
        event.clientX < box.left ||
        event.clientX > box.right ||
        event.clientY < box.top ||
        event.clientY > box.bottom
      )
        dialog.close();
    });
  });
}

/** A closed preview document has no router, persistence or remote requests. */
export function installPreviewClient() {
  mountProjectMedia();
  const nav = document.getElementById("primary-nav");
  const toggle = document.getElementById("nav-toggle");
  const close = () => {
    nav?.setAttribute("data-open", "false");
    toggle?.setAttribute("aria-expanded", "false");
  };
  toggle?.addEventListener("click", () => {
    const open = toggle.getAttribute("aria-expanded") !== "true";
    nav?.setAttribute("data-open", String(open));
    toggle.setAttribute("aria-expanded", String(open));
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      toggle?.getAttribute("aria-expanded") === "true"
    ) {
      close();
      toggle.focus();
    }
  });
  nav?.addEventListener("click", (event) => {
    if (event.target instanceof Element && event.target.closest("a")) close();
  });
  const theme = document.getElementById("theme-toggle");
  const sync = () =>
    theme?.setAttribute(
      "aria-pressed",
      String(document.documentElement.dataset.theme === "dark"),
    );
  sync();
  theme?.addEventListener("click", () => {
    document.documentElement.dataset.theme =
      document.documentElement.dataset.theme === "dark" ? "light" : "dark";
    sync();
  });
  document.documentElement.dataset.pointerModality = "fine";
  document.addEventListener("pointerdown", (event) => {
    document.documentElement.dataset.pointerModality =
      event.pointerType === "touch" ? "coarse" : "fine";
  });
}

/** Install only server-admitted private bytes already carried by this document. */
export async function installOwnedPreviewMedia() {
  const urls = new Map();
  let failed = false;
  const unavailable = () => {
    failed = true;
    parent.postMessage(
      {
        type: "editorial-preview-status",
        request:
          new URL(location.href).searchParams.get("previewRequest") ?? "",
        status: "unavailable",
      },
      "*",
    );
  };
  window.addEventListener(
    "pagehide",
    () => {
      for (const url of urls.values()) URL.revokeObjectURL(url);
    },
    { once: true },
  );
  for (const payload of document.querySelectorAll(
    'script[type="application/octet-stream"][data-preview-owned-media]',
  )) {
    const id = payload.getAttribute("data-preview-owned-media");
    const type = payload.getAttribute("data-media-type");
    if (
      !/^[a-f0-9]{64}\.(?:png|jpg|webp)$/.test(id ?? "") ||
      !["image/png", "image/jpeg", "image/webp"].includes(type) ||
      urls.has(id)
    )
      throw new Error("Invalid preview media payload");
    const text = payload.textContent ?? "";
    const chunks = [];
    for (let offset = 0; offset < text.length; offset += 65536) {
      const part = atob(text.slice(offset, offset + 65536));
      chunks.push(Uint8Array.from(part, (char) => char.charCodeAt(0)));
    }
    urls.set(id, URL.createObjectURL(new Blob(chunks, { type })));
    payload.remove();
  }
  const loads = [];
  for (const element of document.querySelectorAll(
    "[data-preview-owned-src],[data-preview-owned-poster],[data-preview-owned-href],[data-preview-owned-srcset]",
  )) {
    if (element instanceof HTMLImageElement)
      element.addEventListener("error", unavailable, { once: true });
    for (const attr of ["src", "poster", "href"]) {
      const marker = `data-preview-owned-${attr}`;
      const id = element.getAttribute(marker);
      if (!id) continue;
      const url = urls.get(id);
      if (!url) throw new Error("Preview media missing");
      if (
        attr === "src" &&
        element instanceof HTMLImageElement &&
        element.getAttribute("loading") !== "lazy" &&
        element.getBoundingClientRect().top < innerHeight &&
        element.getBoundingClientRect().bottom > 0
      )
        loads.push(
          new Promise((resolve, reject) => {
            element.addEventListener("load", resolve, { once: true });
            element.addEventListener(
              "error",
              () => reject(new Error("Preview media decode failed")),
              { once: true },
            );
          }),
        );
      element.setAttribute(attr, url);
      element.removeAttribute(marker);
    }
    const srcset = element.getAttribute("data-preview-owned-srcset");
    if (srcset) {
      element.setAttribute(
        "srcset",
        srcset.replace(
          /preview-owned:([a-f0-9]{64}\.(?:png|jpg|webp))/g,
          (_, id) => {
            const url = urls.get(id);
            if (!url) throw new Error("Preview media missing");
            return url;
          },
        ),
      );
      element.removeAttribute("data-preview-owned-srcset");
    }
  }
  await Promise.all(loads);
  await document.fonts?.ready;
  if (failed) throw new Error("Preview media decode failed");
  return () => !failed;
}
