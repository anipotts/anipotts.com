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
export type SourceNamesState = {
  names: SourceNames;
  status: "off" | "pending" | "ready" | "failed" | "incomplete";
};

const names = new WeakMap<DataReader, Promise<SourceNamesState>>();

function namesFor(reader: DataReader): Promise<SourceNamesState> {
  let pending = names.get(reader);
  if (!pending) {
    pending = readSourceCatalog(reader, new DataReadSession()).then(
      (catalog): SourceNamesState => {
        if (!catalog || catalog.failure || catalog.incomplete)
          names.delete(reader);
        return {
          names: sourceNames(catalog?.sources ?? []),
          status:
            !catalog || catalog.failure
              ? "failed"
              : catalog.incomplete
                ? "incomplete"
                : "ready",
        };
      },
      (): SourceNamesState => {
        names.delete(reader);
        return { names: EMPTY, status: "failed" };
      },
    );
    names.set(reader, pending);
  }
  return pending;
}

/** Readiness belongs to a reader identity. A new reader never borrows the
 * previous reader's catalog, even for the render before its effect runs. */
export function useSourceNamesState(
  reader: DataReader | null,
): SourceNamesState {
  const [known, setKnown] = useState<{
    reader: DataReader;
    value: SourceNamesState;
  } | null>(null);
  useEffect(() => {
    if (!reader) return;
    let live = true;
    void namesFor(reader).then((value) => live && setKnown({ reader, value }));
    return () => {
      live = false;
    };
  }, [reader]);
  if (!reader) return OFF;
  return known?.reader === reader ? known.value : PENDING;
}

/** Existing consumers may progressively enhance source labels. Overview
 * can instead await useSourceNamesState before revealing its first rows. */
export function useSourceNames(reader: DataReader | null): SourceNames {
  return useSourceNamesState(reader).names;
}

const EMPTY: SourceNames = new Map();
const OFF: SourceNamesState = { names: EMPTY, status: "off" };
const PENDING: SourceNamesState = { names: EMPTY, status: "pending" };

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
