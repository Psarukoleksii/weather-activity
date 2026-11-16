export interface ScoringConfigType {
  readonly scoring: {
    /** Skiing is applicable only at or above this elevation. */
    readonly skiMinElevationM: number;
  };
}
