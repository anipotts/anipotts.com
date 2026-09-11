import { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { imageCrop } from "../../lib/image-crop";

export function ArticleImageCrop({
  file,
  busy,
  onApply,
  onCancel,
}: {
  file: File;
  busy: boolean;
  onApply: (file: Blob) => Promise<void>;
  onCancel: () => void;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const bitmap = useRef<ImageBitmap | null>(null);
  const [ready, setReady] = useState(false);
  const [ratio, setRatio] = useState("wide");
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(50);
  const [y, setY] = useState(50);
  const [error, setError] = useState("");
  const applying = useRef(false);
  useEffect(() => {
    let active = true;
    setReady(false);
    void createImageBitmap(file)
      .then((value) => {
        if (!active) {
          value.close();
          return;
        }
        bitmap.current = value;
        setReady(true);
      })
      .catch(() => {
        if (active) setError("Couldn’t open this image for cropping.");
      });
    return () => {
      active = false;
      bitmap.current?.close();
      bitmap.current = null;
    };
  }, [file]);
  useEffect(() => {
    const image = bitmap.current;
    const target = canvas.current;
    if (!ready || !image || !target) return;
    const crop = imageCrop(
      image.width,
      image.height,
      ratio === "wide" ? 16 / 9 : ratio === "landscape" ? 1.5 : 1,
      zoom,
      x,
      y,
    );
    target.width = Math.max(1, Math.round(crop.width));
    target.height = Math.max(1, Math.round(crop.height));
    const context = target.getContext("2d");
    context?.drawImage(
      image,
      crop.x,
      crop.y,
      crop.width,
      crop.height,
      0,
      0,
      target.width,
      target.height,
    );
  }, [ready, ratio, zoom, x, y]);
  async function apply() {
    if (!ready || busy || applying.current || !canvas.current) return;
    applying.current = true;
    setError("");
    try {
      // PNG preserves the selected pixels without introducing JPEG artifacts.
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.current!.toBlob(
          (value) =>
            value
              ? resolve(value)
              : reject(new Error("Couldn’t create this crop.")),
          "image/png",
        ),
      );
      await onApply(blob);
    } catch (error) {
      setError(
        error instanceof Error
          ? error.message
          : "Couldn’t save this crop. Try again.",
      );
    } finally {
      applying.current = false;
    }
  }
  return (
    <VStack gap={3}>
      <canvas
        ref={canvas}
        className="article-image-preview"
        role="img"
        aria-label="Selected image crop preview"
      />
      <Selector
        label="Crop shape"
        value={ratio}
        isDisabled={busy}
        onChange={setRatio}
        options={[
          { value: "wide", label: "Wide · 16:9" },
          { value: "landscape", label: "Landscape · 3:2" },
          { value: "square", label: "Square · 1:1" },
        ]}
      />
      <Slider
        label="Zoom"
        value={zoom}
        min={1}
        max={3}
        step={0.05}
        isDisabled={busy}
        onChange={setZoom}
        formatValue={(value) => `${value.toFixed(2)}×`}
      />
      <Slider
        label="Horizontal position"
        value={x}
        isDisabled={busy}
        onChange={setX}
      />
      <Slider
        label="Vertical position"
        value={y}
        isDisabled={busy}
        onChange={setY}
      />
      {error && (
        <Banner status="error" title="Crop not saved" description={error} />
      )}
      <HStack gap={2}>
        <Button
          label="Apply crop"
          size="sm"
          variant="primary"
          isDisabled={!ready || busy}
          isLoading={busy}
          onClick={() => void apply()}
        />
        <Button
          label="Cancel crop"
          size="sm"
          variant="ghost"
          isDisabled={busy}
          onClick={onCancel}
        />
      </HStack>
    </VStack>
  );
}
