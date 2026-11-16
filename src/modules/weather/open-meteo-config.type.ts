export interface OpenMeteoConfigType {
  readonly openMeteo: {
    /** Timeout of a single Open-Meteo call. */
    readonly callTimeoutSeconds: number;
  };
}
