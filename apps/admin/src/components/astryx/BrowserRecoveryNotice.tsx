import React, { useState } from "react";
import { Banner } from "./WritingControls";
import { Button } from "./WritingControls";
import { VStack } from "@astryxdesign/core/VStack";
import { TextArea } from "./WritingControls";
import type { RecoveryProblem } from "../../lib/browser-recovery";

const descriptions: Record<RecoveryProblem, string> = {
  "key-required":
    "Unlock browser recovery with your saved key file. Existing copies have been kept.",
  "key-lost":
    "Existing encrypted copies still need their original key. They have been preserved.",
  "authentication-failed":
    "This copy could not be decrypted with this key. Its original bytes have been kept.",
  "signed-out":
    "This stored copy belongs to a session that was signed out. It has not been reopened or retried. You can download it for recovery after signing in; current edits cannot replace it.",
  corrupt:
    "The stored copy could not be read. It has been preserved. Download it before continuing on another page.",
  unsupported:
    "This browser copy needs a newer editor. It has been preserved without changes. Download it or reopen the current application release.",
  oversized:
    "This copy exceeds browser recovery limits. Keep this page open and save or download your edits before leaving.",
  unavailable:
    "Browser storage or safe tab coordination is unavailable. Keep this page open and save or download your edits before leaving.",
  changed:
    "Another tab changed browser recovery. Both stored copies are retained. Compare a copy below before recovering it, or save this page’s current edits before reopening.",
};
export function downloadBrowserRecovery(
  contents: string,
  name = "encrypted-browser-recovery.json",
) {
  const url = URL.createObjectURL(
    new Blob([contents], { type: "application/json;charset=utf-8" }),
  );
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export function BrowserRecoveryNotice({
  problem,
  onDownload,
  candidates = [],
}: {
  problem: RecoveryProblem;
  onDownload?: () => void | Promise<void>;
  candidates?: {
    label: string;
    source: string;
    onChoose: () => void | Promise<void>;
  }[];
}) {
  const [downloading, setDownloading] = useState(false);
  return (
    <VStack gap={3}>
      <Banner
        status="warning"
        title="Browser recovery needs attention"
        description={descriptions[problem]}
        endContent={
          onDownload && (
            <Button
              label="Download encrypted recovery copies"
              size="sm"
              isDisabled={downloading}
              clickAction={() => {
                setDownloading(true);
                void Promise.resolve()
                  .then(onDownload)
                  .finally(() => setDownloading(false));
              }}
            />
          )
        }
      />
      {candidates.map((candidate) => (
        <VStack key={candidate.label} gap={2}>
          <TextArea
            label={candidate.label}
            value={candidate.source}
            isReadOnly
            rows={4}
          />
          <Button
            label={`Recover ${candidate.label.toLowerCase()}`}
            variant="secondary"
            clickAction={candidate.onChoose}
          />
        </VStack>
      ))}
    </VStack>
  );
}
