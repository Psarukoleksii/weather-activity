import { Injectable } from '@nestjs/common';
import { Place } from '../../models/place.entity';
import { normalizeName } from '../../utils/normalize-name';
import { OpenMeteoClient } from '../weather/open-meteo.client';

@Injectable()
export class PlacesService {
  constructor(private readonly openMeteo: OpenMeteoClient) {}

  /** Lookup by normalised name and country; on a tie (same-name towns) the oldest row wins. */
  findByName(city: string, countryCode: string): Promise<Place | null> {
    return Place.findOne({
      where: { nameNormalized: normalizeName(city), countryCode: countryCode.toUpperCase() },
      order: { id: 'ASC' },
    });
  }

  findById(id: string): Promise<Place | null> {
    return Place.findOneBy({ id });
  }

  /**
   * Geocodes the city and stores it with last_requested_at = now(), so the worker sees it.
   * Returns null when the geocoder knows no such city in that country.
   * The geocoder's own spelling is stored, so "Kiev" lands on the "Kyiv" row via geoname_id.
   */
  async createFromGeocoder(city: string, countryCode: string): Promise<Place | null> {
    const hit = await this.openMeteo.geocode(city.trim(), countryCode);
    if (!hit) return null;

    await Place.createQueryBuilder()
      .insert()
      .values({
        geonameId: hit.geonameId,
        name: hit.name,
        nameNormalized: normalizeName(hit.name),
        countryCode: hit.countryCode,
        latitude: hit.latitude,
        longitude: hit.longitude,
        elevationM: hit.elevationM,
        timezone: hit.timezone,
        hasMarineData: null,
        lastRequestedAt: () => 'now()',
      })
      .orIgnore() // ON CONFLICT DO NOTHING (geoname_id is the only unique key)
      .execute();

    return Place.findOneByOrFail({ geonameId: hit.geonameId });
  }

  /** Bumps last_requested_at at most once per 10 minutes, so reads do not turn into writes. */
  async touchRequested(id: string): Promise<void> {
    await Place.createQueryBuilder()
      .update()
      .set({ lastRequestedAt: () => 'now()' })
      .where('id = :id', { id })
      .andWhere("last_requested_at < now() - interval '10 minutes'")
      .execute();
  }
}
