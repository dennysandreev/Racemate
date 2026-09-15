// Release switches are versioned with the application, never browser-only gates.
export const telemetryFlags = {
  telemetryHub: true,
  telemetryInsights: true,
  telemetryShare: true,
  trackEvolution: true,
} as const;
