function sanitize(value) {
  if (value instanceof Error) {
    return {
      name: value.name,
      message: value.message,
    };
  }

  if (!value || typeof value !== "object") return value;

  return JSON.parse(
    JSON.stringify(value, (key, nestedValue) => {
      if (/token|secret|password|authorization|signed/i.test(key)) return "[redacted]";
      if (typeof nestedValue === "string" && nestedValue.includes("?") && /url/i.test(key)) {
        return nestedValue.split("?")[0];
      }
      return nestedValue;
    })
  );
}

export function logInfo(message, details = {}) {
  console.info(`[PrintEase Desktop] ${message}`, sanitize(details));
}

export function logWarn(message, details = {}) {
  console.warn(`[PrintEase Desktop] ${message}`, sanitize(details));
}

export function logError(message, error = {}) {
  console.error(`[PrintEase Desktop] ${message}`, sanitize(error));
}
