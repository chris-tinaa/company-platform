import { createHash } from "node:crypto";

export function jakartaDate(timestamp: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Jakarta",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(timestamp);
  const values = Object.fromEntries(
    parts.map((part) => [part.type, part.value]),
  );
  return `${values.year}-${values.month}-${values.day}`;
}

export function normalizeCoordinate(
  input: string | number,
  axis: "latitude" | "longitude",
): string {
  const number = Number(input);
  const limit = axis === "latitude" ? 90 : 180;
  if (
    !Number.isFinite(number) ||
    input === "" ||
    number < -limit ||
    number > limit
  ) {
    throw new Error("Koordinat lokasi tidak valid");
  }
  return number.toFixed(6);
}

export function normalizeAccuracy(input: string | number): string {
  const number = Number(input);
  if (
    !Number.isFinite(number) ||
    input === "" ||
    number < 0 ||
    number > 10000
  ) {
    throw new Error("Akurasi lokasi tidak valid");
  }
  return number.toFixed(1);
}

export function requestHash(
  employeeId: string,
  latitude: string | number,
  longitude: string | number,
  accuracy: string | number,
  photoBytes: Uint8Array,
): string {
  const fileSha = createHash("sha256").update(photoBytes).digest("hex");
  const payload = [
    "WFH_CHECK_IN",
    employeeId,
    normalizeCoordinate(latitude, "latitude"),
    normalizeCoordinate(longitude, "longitude"),
    normalizeAccuracy(accuracy),
    fileSha,
  ];
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function detectPhotoType(bytes: Uint8Array): "image/jpeg" | "image/png" {
  if (
    bytes.length >= 3 &&
    bytes[0] === 255 &&
    bytes[1] === 216 &&
    bytes[2] === 255
  )
    return "image/jpeg";
  if (
    bytes.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every(
      (value, index) => bytes[index] === value,
    )
  )
    return "image/png";
  throw new Error("Isi foto bukan JPEG atau PNG yang valid");
}
