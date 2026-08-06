const proposals = Object.freeze({
  "job-queue-stalled": { actionName: "jobs.consume_queued", riskClass: "R2" },
  "telegram-delivery-failed": { actionName: "notifications.dispatch", riskClass: "R2" },
  "source-stale": { actionName: "rss.fetch_all", riskClass: "R2" },
});

export function getSafeRecoveryProposal(finding, settings, now = new Date()) {
  const proposal = proposals[finding.ruleKey];
  if (!proposal || !settings?.is_enabled || settings.mode === "shadow") return null;

  const shadowAgeMs = now.getTime() - Date.parse(settings.shadow_started_at);
  if (!Number.isFinite(shadowAgeMs) || shadowAgeMs < 7 * 24 * 60 * 60 * 1_000) return null;

  return {
    ...proposal,
    actionArgs: {},
    autoExecutable: settings.mode === "limited" && settings.r2_actions_enabled === true,
  };
}

export function isAllowedAutomaticAction(actionName) {
  return Object.values(proposals).some((proposal) => proposal.actionName === actionName);
}
