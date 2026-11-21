export interface CameraLocationFix {
  latitude: number;
  longitude: number;
  accuracy: number;
  acquiredAt: number;
}

export const LOCATION_MAX_AGE_MS: number;
export function isFreshLocation(location: CameraLocationFix | null | undefined, now?: number): boolean;
export function canCaptureFrame(location: CameraLocationFix | null | undefined, hasLiveStream: boolean, now?: number): boolean;
