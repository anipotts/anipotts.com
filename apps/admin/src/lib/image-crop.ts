/** Pixel-only crop geometry. No resynthesis or changes to the source image. */
export function imageCrop(
  width: number,
  height: number,
  ratio: number,
  zoom: number,
  x: number,
  y: number,
) {
  if (
    ![width, height, ratio, zoom, x, y].every(Number.isFinite) ||
    width <= 0 ||
    height <= 0 ||
    ratio <= 0 ||
    zoom < 1
  )
    throw new Error("Invalid crop dimensions");
  const cropWidth = Math.min(width, height * ratio) / zoom;
  const cropHeight = cropWidth / ratio;
  return {
    x: ((width - cropWidth) * Math.min(100, Math.max(0, x))) / 100,
    y: ((height - cropHeight) * Math.min(100, Math.max(0, y))) / 100,
    width: cropWidth,
    height: cropHeight,
  };
}
