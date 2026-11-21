export const LOCATION_MAX_AGE_MS = 120_000;

export function isFreshLocation(location, now = Date.now()) {
  if (!location || !Number.isFinite(now)) return false;
  const { latitude, longitude, accuracy, acquiredAt } = location;
  return Number.isFinite(latitude) && latitude >= -90 && latitude <= 90
    && Number.isFinite(longitude) && longitude >= -180 && longitude <= 180
    && Number.isFinite(accuracy) && accuracy >= 0
    && Number.isFinite(acquiredAt) && acquiredAt <= now
    && now - acquiredAt <= LOCATION_MAX_AGE_MS;
}

export function canCaptureFrame(location, hasLiveStream, now = Date.now()) {
  return hasLiveStream === true && isFreshLocation(location, now);
}
