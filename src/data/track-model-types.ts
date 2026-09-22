export type CircuitModelPoint = readonly [
  progress: number,
  worldX: number,
  worldY: number,
  worldZ: number,
];

export type CircuitModelTurn = {
  name?: string;
  number: number;
  progress: number;
};

export type CircuitTerrainRow = readonly number[];

export type CircuitModelData = {
  circuitName: string;
  elevationChangeM: number;
  lapLengthKm: number;
  maxDownhillPercent: number;
  maxUphillPercent: number;
  points: readonly CircuitModelPoint[];
  sectorBreaks: readonly [number, number];
  speedTrapProgress: number;
  turns: readonly CircuitModelTurn[];
};

export type CircuitTerrainData = {
  attribution: string;
  attributionUrl: string;
  bounds: {
    maxX: number;
    maxY: number;
    minX: number;
    minY: number;
  };
  columns: number;
  elevationMaxM: number;
  elevationMinM: number;
  rows: number;
  values: readonly CircuitTerrainRow[];
};

export type TrackBankingRange = {
  angleDeg: number;
  from: number;
  to: number;
};

export type TrackOverpassRange = {
  from: number;
  level?: boolean;
  to: number;
};

export type TrackModelDefinition = {
  aliases: readonly string[];
  camera: {
    centerY: number;
    rotationDeg: number;
    scale: number;
    tiltDeg: number;
    verticalExaggeration: number;
  };
  data: CircuitModelData;
  id: string;
  rendering: {
    annotationOffsets?: {
      highPoint?: readonly [x: number, y: number];
      lowPoint?: readonly [x: number, y: number];
      speedTrap?: readonly [x: number, y: number];
    };
    banking?: readonly TrackBankingRange[];
    contourIntervalM: number;
    curbTurnNumbers: readonly number[];
    curbTurnSides?: Readonly<Partial<Record<number, -1 | 1>>>;
    gravelTurnNumbers: readonly number[];
    overpasses?: readonly TrackOverpassRange[];
    runoffTurnNumbers: readonly number[];
    runoffTurnSides?: Readonly<Partial<Record<number, -1 | 1>>>;
    trackWidthScale?: number;
    turnLabelOffsets: Readonly<Record<number, readonly [x: number, y: number]>>;
    turnLabelTrackOffsets?: Readonly<Partial<Record<number, number>>>;
  };
  terrain: CircuitTerrainData;
  webgl?: {
    assetPath: string;
    camera: {
      fitHeight: number;
      fitWidth: number;
      narrowFitWidth?: number;
      lookAtY: number;
      radius: number;
    };
    elevationDatumLabel: string;
    elevationApproximate?: boolean;
    previewPath: string;
    turnCount: number;
  };
};
