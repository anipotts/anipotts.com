import { describe, it, expect } from "vitest";
import { Schema } from "@tiptap/pm/model";
import { EditorState, NodeSelection, TextSelection } from "@tiptap/pm/state";
import { EditorSelectionBookmark } from "./editor-selection-bookmark";
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: { group: "block", content: "text*" },
    text: {},
    image: { group: "block", atom: true },
  },
});
function setup() {
  return EditorState.create({
    doc: schema.node("doc", null, [
      schema.node("paragraph", null, schema.text("hello")),
      schema.node("image"),
      schema.node("paragraph", null, schema.text("other")),
      schema.node("image"),
    ]),
  });
}
describe("panel selection ownership", () => {
  it("retains the selected image when the user selects another image", () => {
    const state = setup();
    const bookmark = new EditorSelectionBookmark();
    bookmark.capture(NodeSelection.create(state.doc, 7));
    const move = state.tr.setSelection(NodeSelection.create(state.doc, 15));
    bookmark.map(move);
    expect(bookmark.resolve(move.doc)?.from).toBe(7);
  });
  it("maps the image through text inserted before the target", () => {
    const state = setup();
    const bookmark = new EditorSelectionBookmark();
    bookmark.capture(NodeSelection.create(state.doc, 7));
    const typing = state.tr.insertText("new ", 1);
    bookmark.map(typing);
    expect(bookmark.resolve(typing.doc)?.from).toBe(11);
  });
  it("refuses to retarget a removed image to its neighbor", () => {
    const state = setup();
    const bookmark = new EditorSelectionBookmark();
    bookmark.capture(NodeSelection.create(state.doc, 7));
    const deletion = state.tr.delete(7, 8);
    bookmark.map(deletion);
    expect(bookmark.resolve(deletion.doc)).toBeNull();
  });
  it("maps a link range and ignores subsequent caret movement", () => {
    const state = setup();
    const bookmark = new EditorSelectionBookmark();
    bookmark.capture(TextSelection.create(state.doc, 2, 5));
    const typing = state.tr.insertText("prefix ", 1);
    bookmark.map(typing);
    const selection = bookmark.resolve(typing.doc)!;
    expect([selection.from, selection.to]).toEqual([9, 12]);
    bookmark.clear();
    expect(bookmark.resolve(typing.doc)).toBeNull();
  });
});
