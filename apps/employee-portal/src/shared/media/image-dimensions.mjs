export function fitDimensions(width, height, maxSide = 1280) {
  if (![width, height, maxSide].every((n) => Number.isFinite(n) && n > 0))
    throw new Error("Dimensi gambar tidak valid");
  const scale = Math.min(1, maxSide / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}
