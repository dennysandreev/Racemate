const meaningfulNumericMetadataKeys = [
  "closed",
  "emptySessions",
  "generated",
  "restrictedSessions",
  "selected",
  "sessionsChecked",
  "sessionsSaved",
];

const meaningfulArrayMetadataKeys = [
  "errors",
  "failed",
  "failures",
];

export function shouldPersistQuietJobResult(result = {}) {
  if (Number(result.itemsProcessed ?? 0) > 0) {
    return true;
  }

  const metadata = result.metadata && typeof result.metadata === "object"
    ? result.metadata
    : {};

  if (metadata.forceLog === true) {
    return true;
  }

  if (meaningfulNumericMetadataKeys.some((key) => Number(metadata[key] ?? 0) > 0)) {
    return true;
  }

  return meaningfulArrayMetadataKeys.some((key) => Array.isArray(metadata[key]) && metadata[key].length > 0);
}
