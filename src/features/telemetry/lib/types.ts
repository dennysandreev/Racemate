export type * from "../../../../worker/telemetry/types";

// Raw provider channels stay compatible with already cached comparisons.
export type Channel = Exclude<import("../../../../worker/telemetry/types").Channel, "drs">;
