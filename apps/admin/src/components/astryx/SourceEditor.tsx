import React, { useEffect, useRef } from "react";
import { Compartment, EditorState } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { history, historyKeymap, defaultKeymap } from "@codemirror/commands";
import { markdown } from "@codemirror/lang-markdown";

export default function SourceEditor({
  source,
  onChange,
  hidden,
  readOnly = false,
}: {
  source: string;
  onChange: (source: string) => void;
  hidden: boolean;
  readOnly?: boolean;
}) {
  const host = useRef<HTMLElement | null>(null);
  const view = useRef<EditorView | null>(null);
  const readOnlyMode = useRef(new Compartment());
  const appliedSource = useRef(source);
  const applyingSource = useRef(false);
  const newline = useRef(source.includes("\r\n") ? "\r\n" : "\n");
  const change = useRef(onChange);
  change.current = onChange;
  useEffect(() => {
    const instance = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: source,
        extensions: [
          markdown(),
          readOnlyMode.current.of(EditorState.readOnly.of(readOnly)),
          history(),
          keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({ "aria-label": "record source" }),
          EditorView.updateListener.of((update) => {
            if (update.docChanged && !applyingSource.current) {
              const next = update.state.doc
                .toString()
                .replaceAll("\n", newline.current);
              appliedSource.current = next;
              change.current(next);
            }
          }),
        ],
      }),
    });
    view.current = instance;
    return () => {
      instance.destroy();
    };
  }, []);
  useEffect(() => {
    view.current?.dispatch({
      effects: readOnlyMode.current.reconfigure(
        EditorState.readOnly.of(readOnly),
      ),
    });
  }, [readOnly]);
  useEffect(() => {
    const current = view.current;
    if (current && appliedSource.current !== source) {
      // CodeMirror normalizes line breaks internally. Merely displaying recovered
      // source must never become an authored edit or alter its retry payload.
      appliedSource.current = source;
      newline.current = source.includes("\r\n") ? "\r\n" : "\n";
      applyingSource.current = true;
      try {
        current.dispatch({
          changes: { from: 0, to: current.state.doc.length, insert: source },
        });
      } finally {
        applyingSource.current = false;
      }
    }
  }, [source]);
  return (
    <section
      ref={host}
      hidden={hidden}
      className="editorial-source"
      aria-label="Source editor"
    />
  );
}
