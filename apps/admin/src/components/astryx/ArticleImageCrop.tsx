import React, { useEffect, useRef, useState } from "react";
import { VStack } from "@astryxdesign/core/VStack";
import { HStack } from "@astryxdesign/core/HStack";
import { Selector } from "@astryxdesign/core/Selector";
import { Slider } from "@astryxdesign/core/Slider";
import { Button } from "@astryxdesign/core/Button";
import { Banner } from "@astryxdesign/core/Banner";
import { Text } from "@astryxdesign/core/Text";
import { cropOutputSize, imageCrop } from "../../lib/image-crop";

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
  const [encoding, setEncoding] = useState(false);
  const generation = useRef(0);
  const locked = busy || encoding;
  useEffect(() => {
    const current = ++generation.current;
    let active = true;
    setError("");
    setEncoding(false);
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
      if (generation.current === current) generation.current++;
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
      ratio === "panorama"
        ? 2.4
        : ratio === "wide"
          ? 16 / 9
          : ratio === "landscape"
            ? 1.5
            : 1,
      zoom,
      x,
      y,
    );
    const output = cropOutputSize(crop.width, crop.height);
    target.width = output.width;
    target.height = output.height;
    try {
      const context = target.getContext("2d");
      if (!context) throw new Error("Canvas unavailable");
      context.imageSmoothingQuality = "high";
      context.drawImage(
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
    } catch {
      setReady(false);
      setError("Couldn’t render this crop. Cancel and try again.");
    }
  }, [ready, ratio, zoom, x, y]);
  async function apply() {
    if (!ready || busy || applying.current || !canvas.current) return;
    applying.current = true;
    const current = generation.current;
    setEncoding(true);
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
      if (generation.current !== current) return;
      await onApply(blob);
    } catch (error) {
      if (generation.current !== current) return;
      setError(
        error instanceof Error
          ? error.message
          : "Couldn’t save this crop. Try again.",
      );
    } finally {
      applying.current = false;
      if (generation.current === current) setEncoding(false);
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
      <Text color="secondary">
        Crops are saved up to 2 megapixels. Your original image is kept.
      </Text>
      <Selector
        label="Crop shape"
        value={ratio}
        isDisabled={locked}
        onChange={setRatio}
        options={[
          { value: "panorama", label: "Panorama · 2.4:1" },
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
        isDisabled={locked}
        onChange={setZoom}
        formatValue={(value) => `${value.toFixed(2)}×`}
      />
      <Slider
        label="Horizontal position"
        value={x}
        isDisabled={locked}
        onChange={setX}
      />
      <Slider
        label="Vertical position"
        value={y}
        isDisabled={locked}
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
          isDisabled={!ready || locked}
          isLoading={locked}
          onClick={() => void apply()}
        />
        <Button
          label="Cancel crop"
          size="sm"
          variant="ghost"
          isDisabled={locked}
          onClick={onCancel}
        />
      </HStack>
    </VStack>
  );
}
