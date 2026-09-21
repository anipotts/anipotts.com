import React, { Component, type ReactNode } from "react";
import { Banner } from "@astryxdesign/core/Banner";

/** Keep optional editor-tool failures outside the draft controller's lifetime. */
export class EditorToolBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    if (this.state.failed)
      return (
        <Banner
          status="warning"
          title="Source editor could not load"
          description="Your draft remains in the editor. Use Back to editor to continue, or download your draft from Document actions before reloading to try again."
        />
      );
    return this.props.children;
  }
}
