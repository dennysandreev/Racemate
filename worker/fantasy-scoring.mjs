export function scoreFantasyPrediction(prediction, actual) {
  const predictedTop10 = normalizePredictionDriverIds(prediction.top10_driver_ids);
  const actualPositionByDriver = new Map(
    actual.top10DriverIds.map((driverId, index) => [driverId, index + 1]),
  );
  const top10Rows = predictedTop10.map((driverId, index) => {
    const predictedPosition = index + 1;
    const actualPosition = actualPositionByDriver.get(driverId) ?? null;
    const diff = actualPosition === null ? null : Math.abs(actualPosition - predictedPosition);
    const points = diff === null ? 0 : diff === 0 ? 5 : diff === 1 ? 3 : 1;

    return {
      actualPosition,
      driverId,
      points,
      predictedPosition,
    };
  });
  const top10Points = top10Rows.reduce((sum, row) => sum + row.points, 0);
  const top10Bonus = scoreTop10Bonus(predictedTop10, actual.top10DriverIds);
  const polePoints = prediction.pole_driver_id && prediction.pole_driver_id === actual.poleDriverId ? 10 : 0;
  const fastestLapPoints =
    prediction.fastest_lap_driver_id && prediction.fastest_lap_driver_id === actual.fastestLapDriverId
      ? 8
      : 0;
  const firstDnfPoints = scoreFirstDnf(prediction, actual.firstDnfDriverIds);
  const topScoringTeamPoints =
    prediction.top_scoring_team_id && prediction.top_scoring_team_id === actual.topScoringTeamId ? 10 : 0;
  const fastestPitStopTeamPoints =
    prediction.fastest_pit_stop_team_id && prediction.fastest_pit_stop_team_id === actual.fastestPitStopTeamId
      ? 10
      : 0;
  const specialPoints =
    polePoints + fastestLapPoints + firstDnfPoints + topScoringTeamPoints + fastestPitStopTeamPoints;

  return {
    bonuses: {
      allTop10: top10Bonus === 15 ? 15 : 0,
      perfectTop10: top10Bonus === 50 ? 50 : 0,
      podiumAnyOrder: top10Bonus === 5 ? 5 : 0,
    },
    specialPoints,
    specials: {
      fastestLap: fastestLapPoints,
      fastestPitStopTeam: fastestPitStopTeamPoints,
      firstDnf: firstDnfPoints,
      pole: polePoints,
      topScoringTeam: topScoringTeamPoints,
    },
    top10: top10Rows,
    top10Bonus,
    top10Points,
    total: top10Points + top10Bonus + specialPoints,
  };
}

function scoreTop10Bonus(predictedTop10, actualTop10) {
  if (predictedTop10.length !== 10 || actualTop10.length < 10) {
    return 0;
  }

  if (predictedTop10.every((driverId, index) => driverId === actualTop10[index])) {
    return 50;
  }

  const actualTop10Set = new Set(actualTop10);
  const allTop10AnyOrder = predictedTop10.every((driverId) => actualTop10Set.has(driverId));

  if (allTop10AnyOrder) {
    return 15;
  }

  const actualPodiumSet = new Set(actualTop10.slice(0, 3));
  const predictedPodiumSet = new Set(predictedTop10.slice(0, 3));
  const podiumAnyOrder =
    predictedPodiumSet.size === 3 &&
    [...actualPodiumSet].every((driverId) => predictedPodiumSet.has(driverId));

  return podiumAnyOrder ? 5 : 0;
}

function scoreFirstDnf(prediction, firstDnfDriverIds) {
  const pickKind = prediction.dnf_pick_kind === "none" ? "none" : "driver";

  if (!firstDnfDriverIds.length) {
    return pickKind === "none" ? 12 : 0;
  }

  return pickKind === "driver" && firstDnfDriverIds.includes(prediction.dnf_driver_id) ? 12 : 0;
}

function normalizePredictionDriverIds(value) {
  return Array.isArray(value)
    ? value.filter((driverId) => typeof driverId === "string" && driverId.length > 0).slice(0, 10)
    : [];
}
