export type FantasyPredictionScope = "qualification" | "race";

export function resolveFantasyPredictionScope({
  qualificationLocked,
  requestedScope,
}: {
  qualificationLocked: boolean;
  requestedScope?: string;
}): FantasyPredictionScope {
  if (requestedScope === "qualification" || requestedScope === "race") {
    return requestedScope;
  }

  return qualificationLocked ? "race" : "qualification";
}
