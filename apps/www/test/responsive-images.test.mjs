import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { dist, startTags } from "./built-html.mjs";

const page = (file) => startTags(readFileSync(join(dist, file), "utf8"));
const images = (tags) => tags.filter((tag) => tag.name === "img");
const screenshots = (tags) =>
  images(tags).filter((tag) => tag.attributes.src?.startsWith("/images/work/"));

function assertResponsive(img) {
  const { src, srcset, sizes, width, height } = img.attributes;
  assert.match(src, /-800\.webp$/, `${src} falls back to the 800px variant`);
  assert.match(srcset ?? "", /-800\.webp 800w, \S+-1600\.webp 1600w$/, src);
  assert.ok(sizes, `${src} declares sizes`);
  assert.ok(Number(width) > 0 && Number(height) > 0, `${src} has dimensions`);
}

test("work previews ship responsive variants and only the first is a priority fetch", () => {
  const tags = page("work.html");
  const shots = screenshots(tags);
  assert.ok(shots.length >= 2, "work lists at least two previews");
  shots.forEach(assertResponsive);
  const [first, ...rest] = shots;
  assert.equal(first.attributes.loading, "eager");
  assert.equal(first.attributes.fetchpriority, "high");
  for (const img of rest) {
    assert.equal(img.attributes.loading, "lazy", img.attributes.src);
    assert.equal(img.attributes.fetchpriority, undefined, img.attributes.src);
  }
  const phoneSources = tags.filter(
    (tag) => tag.name === "source" && tag.attributes.media,
  );
  assert.equal(phoneSources.length, shots.length);
  for (const source of phoneSources) {
    assert.match(source.attributes.srcset, /-800\.webp$/);
    // A tablet or landscape phone at 2x would upscale the 800px file 1.6 times.
    const rem = Number(
      source.attributes.media.match(/max-width:\s*([\d.]+)rem/)?.[1],
    );
    assert.ok(
      rem > 0 && rem * 16 <= 480,
      `phone override ${source.attributes.media} stays on portrait phones`,
    );
  }
  for (const img of shots)
    for (const candidate of img.attributes.srcset.split(", "))
      assert.ok(
        existsSync(join(dist, candidate.split(" ")[0])),
        `${candidate} is in the build`,
      );
});

// Card images are sized width: auto inside a contain box, so a srcset image
// renders no wider than its sizes value. Single-column layouts must declare the
// full viewport, or landscape phones and small tablets get shrunken previews.
test("card sizes never understate single-column preview boxes", () => {
  const expectations = [
    ["work.html", "(max-width: 52rem) 100vw, 26rem"],
    ["index.html", "(max-width: 640px) 100vw, 27rem"],
  ];
  for (const [file, sizes] of expectations) {
    const shots = screenshots(page(file));
    assert.ok(shots.length > 0, file);
    for (const img of shots)
      assert.equal(img.attributes.sizes, sizes, `${file} ${img.attributes.src}`);
  }
});

test("home loads the first feature image eagerly and the second lazily", () => {
  const shots = screenshots(page("index.html"));
  assert.ok(shots.length >= 2, "home shows two feature images");
  shots.forEach(assertResponsive);
  assert.deepEqual(
    shots.map((img) => img.attributes.loading),
    ["eager", ...shots.slice(1).map(() => "lazy")],
  );
  assert.ok(shots.every((img) => !img.attributes.fetchpriority));
});

test("detail stages request variants while enlarge keeps the full-size file", () => {
  const html = readFileSync(
    join(dist, "work/pgi-research-platform.html"),
    "utf8",
  );
  const shots = screenshots(startTags(html));
  assert.equal(shots.length, 4);
  shots.forEach(assertResponsive);
  assert.deepEqual(
    shots.map((img) => img.attributes.loading),
    ["eager", "lazy", "lazy", "lazy"],
  );
  const enlarge = startTags(html).filter(
    (tag) => tag.attributes["data-media-enlarge"] !== undefined,
  );
  assert.equal(enlarge.length, 4);
  for (const link of enlarge)
    assert.match(link.attributes.href, /paragon-portal-[a-z-]+\.webp$/);
});

test("card marks carry dimensions and hero mention marks load eagerly", () => {
  for (const file of ["index.html", "work.html"]) {
    const marks = images(page(file)).filter((img) =>
      /\b(work-card__mark|experience-feature__mark)\b/.test(
        img.attributes.class ?? "",
      ),
    );
    assert.ok(marks.length > 0, file);
    for (const img of marks) {
      assert.ok(
        Number(img.attributes.width) > 0 && Number(img.attributes.height) > 0,
        `${file} ${img.attributes.src} has width and height`,
      );
    }
  }
  const mentions = images(page("index.html")).filter((img) =>
    /\blogo\b/.test(img.attributes.class ?? ""),
  );
  assert.ok(mentions.length > 0);
  for (const img of mentions) {
    assert.equal(img.attributes.loading, "eager", img.attributes.src);
    assert.equal(img.attributes.decoding, "async", img.attributes.src);
    assert.equal(img.attributes.fetchpriority, undefined, img.attributes.src);
  }
});
