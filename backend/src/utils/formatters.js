function parseMaybeJson(value) {
  if (value == null) {
    return null;
  }

  if (typeof value === "object") {
    return value;
  }

  try {
    return JSON.parse(value);
  } catch (error) {
    return value;
  }
}

function toBoolean(value) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "number") {
    return value === 1;
  }

  if (typeof value === "string") {
    return ["true", "1", "yes"].includes(value.toLowerCase());
  }

  return false;
}

module.exports = {
  parseMaybeJson,
  toBoolean,
};
