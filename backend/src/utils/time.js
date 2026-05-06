const MIN_PLAUSIBLE_DEVICE_UNIX_SECONDS = 1_700_000_000;
const MAX_DEVICE_CLOCK_SKEW_SECONDS = 7 * 24 * 60 * 60;

function toDateFromUnixSeconds(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return new Date();
  }

  return new Date(numericValue * 1000);
}

function isPlausibleDeviceUnixSeconds(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return false;
  }

  const maxFutureSeconds = Math.floor(Date.now() / 1000) + MAX_DEVICE_CLOCK_SKEW_SECONDS;
  return numericValue >= MIN_PLAUSIBLE_DEVICE_UNIX_SECONDS &&
    numericValue <= maxFutureSeconds;
}

function toDateFromDeviceTimestamp(value) {
  if (!isPlausibleDeviceUnixSeconds(value)) {
    return new Date();
  }

  return toDateFromUnixSeconds(value);
}

function toIsoDate(value) {
  if (!value) {
    return null;
  }

  if (value instanceof Date) {
    return value.toISOString();
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function parseDateBoundary(value, endOfDay = false) {
  if (!value) {
    return null;
  }

  const suffix = endOfDay ? "T23:59:59.999Z" : "T00:00:00.000Z";
  const parsed = new Date(`${value}${suffix}`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

module.exports = {
  isPlausibleDeviceUnixSeconds,
  parseDateBoundary,
  toDateFromDeviceTimestamp,
  toDateFromUnixSeconds,
  toIsoDate,
};
