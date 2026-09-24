import { createContext, useContext, useEffect, useState } from "react";
import { nextDataOffset, type DataResult } from "../../data/personal-context";
import { DataReadSession, type DataReader } from "../../lib/data-read-session";
import { parseItems, parseSource, type DataSourceRow } from "./data-model";
import { sourceNames, type SourceNames } from "./sources-model";
import { sourceNaming, type Naming } from "../../lib/naming";

type Failure = Exclude<DataResult, { state: "ready" }>;

/** The catalog is read whole, since rows fold across pages; this bounds it. */
export const SOURCE_CATALOG_PAGES = 10;

export type SourceCatalog = {
  sources: DataSourceRow[];
  /** The reader's total, from its first page. */
  total: number | undefined;
  /** The first page failed: nothing was read. */
  failure: Failure | null;
  /** A later page failed, or the bound was reached with more to read. */
  incomplete: boolean;
};

/**
 * Every page of /v1/data/sources, up to SOURCE_CATALOG_PAGES. Null when the
 * session moved on (a newer read or a closed view) before it finished.
 */
export async function readSourceCatalog(
  reader: DataReader,
  session: DataReadSession,
): Promise<SourceCatalog | null> {
  const sources: DataSourceRow[] = [];
  let total: number | undefined;
  let offset: number | null = 0;
  let pages = 0;
  while (offset !== null && pages < SOURCE_CATALOG_PAGES) {
    const result = await session.run(reader, { method: "sources", offset });
    if (!result) return null;
    pages += 1;
    if (result.state !== "ready")
      return {
        sources,
        total,
        failure: pages === 1 ? result : null,
        incomplete: pages > 1,
      };
    if (pages === 1 && typeof result.data.total === "number")
      total = result.data.total;
    sources.push(...parseItems(result.data, parseSource));
    try {
      offset = nextDataOffset(result.data.next_offset, offset);
    } catch {
      offset = null;
    }
  }
  return { sources, total, failure: null, incomplete: offset !== null };
}

/** One catalog read per reader: Records, the overview and a record's panel
 * share it. A failed read names sources from their ids instead. */
const names = new WeakMap<DataReader, Promise<SourceNames>>();

function namesFor(reader: DataReader): Promise<SourceNames> {
  let pending = names.get(reader);
  if (!pending) {
    pending = readSourceCatalog(reader, new DataReadSession()).then(
      (catalog) => {
        // A failed read is tried again by the next view that asks.
        if (!catalog || catalog.failure) names.delete(reader);
        return sourceNames(catalog?.sources ?? []);
      },
      () => {
        names.delete(reader);
        return sourceNames([]);
      },
    );
    names.set(reader, pending);
  }
  return pending;
}

/**
 * The catalog's names for a reader, so a record's source reads the same on
 * Records, the overview and its panel as on Sources ("Contacts", not the
 * id's brand word). Empty until the catalog arrives; ids missing from it
 * fall back to their own naming (lib/naming.ts sourceNaming).
 */
export function useSourceNames(reader: DataReader | null): SourceNames {
  const [known, setKnown] = useState<SourceNames>(EMPTY);
  useEffect(() => {
    if (!reader) return;
    let live = true;
    void namesFor(reader).then((next) => live && setKnown(next));
    return () => {
      live = false;
    };
  }, [reader]);
  return reader ? known : EMPTY;
}

const EMPTY: SourceNames = new Map();

/** The catalog's names for the rows below: Records and the overview provide
 * them once, and every source cell and filter chip reads them. */
export const SourceNamesContext = createContext<SourceNames>(EMPTY);

/**
 * A record's source as every page names it: the catalog's name when the
 * catalog lists the id, else the id's own naming. `host` is the record's
 * device, when System names one.
 */
export function namedSource(
  id: string,
  names: SourceNames,
  host?: string | null,
): Naming {
  const naming = sourceNaming({ id, host });
  const known = names.get(id);
  return known ? { ...naming, name: known.name, tile: known.tile } : naming;
}

/** namedSource with the names this view provides. */
export function useNamedSource(
  id: string | null | undefined,
  host?: string | null,
): Naming | null {
  const names = useContext(SourceNamesContext);
  return id ? namedSource(id, names, host) : null;
}
