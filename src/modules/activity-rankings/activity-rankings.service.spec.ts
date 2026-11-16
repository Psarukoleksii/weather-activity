import { GraphQLError } from 'graphql';
import { ActivityRankingsService, MAX_CITY_LENGTH } from './activity-rankings.service';

describe('ActivityRankingsService input validation', () => {
  // Validation happens before any dependency is used.
  const service = new ActivityRankingsService({} as never, {} as never, {} as never);

  const codeOf = async (city: string, country: string) => {
    try {
      await service.getRankings(city, country);
      return 'ok';
    } catch (err) {
      return (err as GraphQLError).extensions?.code;
    }
  };

  it('rejects an empty city, a too long city and a non-alpha-2 country', async () => {
    expect(await codeOf('  ', 'PL')).toBe('BAD_USER_INPUT');
    expect(await codeOf('x'.repeat(MAX_CITY_LENGTH + 1), 'PL')).toBe('BAD_USER_INPUT');
    expect(await codeOf('Zakopane', 'POL')).toBe('BAD_USER_INPUT');
  });

  it('does not echo an over-long city back in the error', async () => {
    const long = 'x'.repeat(5000);
    await expect(service.getRankings(long, 'PL')).rejects.toThrow(`city must be at most ${MAX_CITY_LENGTH} characters`);
  });
});
