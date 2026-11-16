export enum ActivityType {
  SKIING = 'SKIING',
  SURFING = 'SURFING',
  OUTDOOR_SIGHTSEEING = 'OUTDOOR_SIGHTSEEING',
  INDOOR_SIGHTSEEING = 'INDOOR_SIGHTSEEING',
}

/** Order in which activities are returned by the API. */
export const ACTIVITY_ORDER: readonly ActivityType[] = [
  ActivityType.SKIING,
  ActivityType.SURFING,
  ActivityType.OUTDOOR_SIGHTSEEING,
  ActivityType.INDOOR_SIGHTSEEING,
];
