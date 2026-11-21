import { fitDimensions } from "./image-dimensions.mjs";

type DecodedImage = {
  width: number;
  height: number;
  draw: (
    context: CanvasRenderingContext2D,
    width: number,
    height: number,
  ) => void;
  close: () => void;
};

async function decodePhoto(file: File): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file, {
        imageOrientation: "from-image",
      });
      return {
        width: bitmap.width,
        height: bitmap.height,
        draw: (context, width, height) =>
          context.drawImage(bitmap, 0, 0, width, height),
        close: () => bitmap.close(),
      };
    } catch {
      return decodeWithImage(file);
    }
  }
  return decodeWithImage(file);
}

async function decodeWithImage(file: File): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () =>
        reject(new Error("Foto tidak dapat dibaca oleh perangkat"));
      image.src = url;
    });
    return {
      width: image.naturalWidth,
      height: image.naturalHeight,
      draw: (context, width, height) =>
        context.drawImage(image, 0, 0, width, height),
      close: () => URL.revokeObjectURL(url),
    };
  } catch (error) {
    URL.revokeObjectURL(url);
    throw error;
  }
}

export async function compressPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Format foto harus JPG atau PNG");
  const image = await decodePhoto(file);
  try {
    const dimensions = fitDimensions(image.width, image.height, 1280);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Kompresi foto tidak tersedia pada perangkat ini");
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, dimensions.width, dimensions.height);
    image.draw(context, dimensions.width, dimensions.height);
    for (const quality of [0.8, 0.7, 0.6]) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (value) =>
            value ? resolve(value) : reject(new Error("Kompresi foto gagal")),
          "image/jpeg",
          quality,
        ),
      );
      if (blob.size <= 900_000 || quality === 0.6) {
        if (blob.size > 5_242_880)
          throw new Error("Ukuran foto terlalu besar setelah kompresi");
        return new File([blob], "bukti-absensi.jpg", {
          type: "image/jpeg",
          lastModified: Date.now(),
        });
      }
    }
    throw new Error("Kompresi foto gagal");
  } finally {
    image.close();
  }
}
