import { fitDimensions } from "./image-dimensions.mjs";

export async function compressPhoto(file: File): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type))
    throw new Error("Format foto harus JPG atau PNG");
  const bitmap = await createImageBitmap(file, {
    imageOrientation: "from-image",
  });
  try {
    const dimensions = fitDimensions(bitmap.width, bitmap.height, 1280);
    const canvas = document.createElement("canvas");
    canvas.width = dimensions.width;
    canvas.height = dimensions.height;
    const context = canvas.getContext("2d");
    if (!context)
      throw new Error("Kompresi foto tidak tersedia pada perangkat ini");
    context.drawImage(bitmap, 0, 0, dimensions.width, dimensions.height);
    for (const quality of [0.8, 0.7, 0.6]) {
      const blob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (result) =>
            result ? resolve(result) : reject(new Error("Kompresi foto gagal")),
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
    bitmap.close();
  }
}
