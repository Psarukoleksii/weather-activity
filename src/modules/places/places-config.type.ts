export interface PlacesConfigType {
  readonly places: {
    /** How long "the geocoder knows no such city" is remembered, so repeats do not call Open-Meteo. */
    readonly notFoundCacheTtlSeconds: number;
  };
}
