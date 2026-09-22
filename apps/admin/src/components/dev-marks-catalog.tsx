import React from "react";
import { MARK_IDS, MARKS } from "@anipotts/brand/marks";
import { BrandTile, type BrandTileSize } from "./BrandTile";
import {
  DEVICE_MARKS,
  GLYPH_KINDS,
  LINK_MARKS,
  OPS_MARKS,
  SOURCE_MARKS,
  deviceMark,
  linkMark,
  opsMark,
  sourceMark,
  type TileRef,
} from "../lib/marks";
import "./dev-marks-catalog.css";

const SIZES: BrandTileSize[] = [20, 24, 28];

function Sizes({ tile }: { tile: TileRef }) {
  return (
    <span className="dev-marks-sizes">
      {SIZES.map((size) => (
        <BrandTile key={size} {...tile} size={size} />
      ))}
    </span>
  );
}

function Entry({
  tile,
  name,
  note,
}: {
  tile: TileRef;
  name: string;
  note?: string;
}) {
  return (
    <li className="dev-marks-entry">
      <Sizes tile={tile} />
      <span className="dev-marks-name">{name}</span>
      {note && <code className="dev-marks-note">{note}</code>}
    </li>
  );
}

function Panel({ scheme }: { scheme: "light" | "dark" }) {
  return (
    <section
      className="dev-marks-panel"
      style={{ colorScheme: scheme }}
      aria-label={`${scheme} theme`}
    >
      <h2>Marks</h2>
      <ul>
        {MARK_IDS.map((id) => (
          <Entry
            key={id}
            tile={{ id, kind: "unknown" }}
            name={MARKS[id].label}
            note={id}
          />
        ))}
      </ul>
      <h2>Fallbacks</h2>
      <ul>
        {GLYPH_KINDS.map((kind) => (
          <Entry key={kind} tile={{ id: null, kind }} name={kind} />
        ))}
      </ul>
      <h2>Ops</h2>
      <ul>
        {["host.ap-mini", ...Object.keys(OPS_MARKS)].map((id) => (
          <Entry key={id} tile={opsMark({ id })} name={id} />
        ))}
      </ul>
      <h2>Devices</h2>
      <ul>
        {Object.keys(DEVICE_MARKS).map((device) => (
          <Entry key={device} tile={deviceMark(device)} name={device} />
        ))}
      </ul>
      <h2>Sources</h2>
      <ul>
        {Object.keys(SOURCE_MARKS).map((source) => (
          <Entry key={source} tile={sourceMark(source)} name={source} />
        ))}
      </ul>
      <h2>Links</h2>
      <ul>
        {Object.keys(LINK_MARKS).map((host) => (
          <Entry key={host} tile={linkMark(`https://${host}`)} name={host} />
        ))}
      </ul>
    </section>
  );
}

/** Every mark, fallback and mapped entity at 20, 24 and 28px in both themes.
 * Development only, through the component catalog route. */
export function DevMarksCatalog() {
  return (
    <main className="dev-marks">
      <h1>Brand tiles</h1>
      <div className="dev-marks-panels">
        <Panel scheme="light" />
        <Panel scheme="dark" />
      </div>
    </main>
  );
}
