import nameData from './nameGeneratorData.json';

type RandomSource = () => number;

function pick<T>(items: readonly T[], random: RandomSource): T {
  const item = items[Math.floor(random() * items.length)];
  if (item === undefined) throw new Error('Cannot pick from an empty name list.');
  return item;
}

function digits(length: number, random: RandomSource): string {
  return Array.from({ length }, () => Math.floor(random() * 10)).join('');
}

export function generateRandomName(random: RandomSource = Math.random): string {
  const prefix = pick(nameData.prefixes, random);
  const main = pick(nameData.mains, random);
  const suffix = pick(nameData.suffixes, random).replace('####', digits(4, random));
  const patterns = [[prefix, main, suffix], [prefix, main], [main, suffix], [prefix, suffix]];
  const parts = patterns[Math.floor(random() * patterns.length)] ?? patterns[0]!;
  const spacedName = parts.join(' ').replace(' ,', ',');
  const separator = spacedName.includes(',') ? ' ' : pick(nameData.separators, random);
  const name = spacedName.replaceAll(' ', separator);
  return random() < 0.75 ? name : pick(nameData.brackets, random).replace('{name}', name);
}

export interface WritableFocusableText {
  value: string;
  focus(): void;
}

export function replaceWithRandomName(
  field: WritableFocusableText,
  generate: () => string = generateRandomName,
): void {
  field.value = generate();
  field.focus();
}
