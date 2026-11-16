/** Letters that do not decompose into base letter + diacritic under NFD. */
const SPECIAL_LETTERS: Record<string, string> = {
  ł: 'l',
  ø: 'o',
  đ: 'd',
  ð: 'd',
  ħ: 'h',
  ı: 'i',
  ß: 'ss',
  æ: 'ae',
  œ: 'oe',
  þ: 'th',
};

/** Lower case, no diacritics, single spaces: "  Kraków " → "krakow". */
export function normalizeName(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[łøđðħıßæœþ]/g, (ch) => SPECIAL_LETTERS[ch] ?? ch)
    .replace(/\s+/g, ' ');
}
