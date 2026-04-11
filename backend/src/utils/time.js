function toDateFromUnixSeconds(value) {
  const numericValue = Number(value);

  if (!Number.isFinite(numericValue)) {
    return new Date();
  }

  return new Date(numericValue * 1000);
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
  parseDateBoundary,
  toDateFromUnixSeconds,
  toIsoDate,
};
