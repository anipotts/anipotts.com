import {
  NodeSelection,
  type Selection,
  type SelectionBookmark,
  type Transaction,
} from "@tiptap/pm/state";
import type { Node } from "@tiptap/pm/model";

/** A panel owns its opening target, independently of later caret movement. */
export class EditorSelectionBookmark {
  private bookmark: SelectionBookmark | null = null;
  private nodePosition: number | null = null;
  capture(selection: Selection) {
    this.bookmark = selection.getBookmark();
    this.nodePosition =
      selection instanceof NodeSelection ? selection.from : null;
  }
  map(transaction: Transaction) {
    if (!this.bookmark || !transaction.docChanged) return;
    if (this.nodePosition !== null) {
      const mapped = transaction.mapping.mapResult(this.nodePosition, 1);
      if (mapped.deleted) {
        this.clear();
        return;
      }
      this.nodePosition = mapped.pos;
    }
    this.bookmark = this.bookmark.map(transaction.mapping);
  }
  resolve(doc: Node): Selection | null {
    return this.bookmark?.resolve(doc) ?? null;
  }
  clear() {
    this.bookmark = null;
    this.nodePosition = null;
  }
}
