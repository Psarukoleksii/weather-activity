import { normalizeName } from './normalize-name';

describe('normalizeName', () => {
  it.each([
    ['Zakopane', 'zakopane'],
    ['  Kraków ', 'krakow'],
    ['Łódź', 'lodz'],
    ['São  Paulo', 'sao paulo'],
    ['Zürich', 'zurich'],
    ['Malmö', 'malmo'],
    ['Kyiv', 'kyiv'],
    ['Straße', 'strasse'],
    ['Århus', 'arhus'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeName(input)).toBe(expected);
  });
});
