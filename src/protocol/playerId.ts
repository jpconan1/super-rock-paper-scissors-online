import { PLAYER_ID_WORDS } from './playerIdWords';

export const PLAYER_ID_PATTERN = /^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/;
export const PLAYER_ID_MAX_ATTEMPTS = 20;

export type PlayerAccountType = 'guest' | 'google' | 'apple' | 'email';

export function isPlayerAccountType(value: unknown): value is PlayerAccountType {
  return value === 'guest' || value === 'google' || value === 'apple' || value === 'email';
}

export function isReadablePlayerId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 100 && PLAYER_ID_PATTERN.test(value);
}

function secureRandom(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0]! / 0x1_0000_0000;
}

export function generateReadablePlayerId(random: () => number = secureRandom): string {
  const pick = (items: readonly string[]) => items[Math.min(items.length - 1, Math.floor(random() * items.length))]!;
  const suffix = Math.min(99, Math.floor(random() * 100)).toString().padStart(2, '0');
  return [pick(PLAYER_ID_WORDS.things), pick(PLAYER_ID_WORDS.vibes), pick(PLAYER_ID_WORDS.foods), pick(PLAYER_ID_WORDS.creatures), suffix].join('-');
}

export async function claimReadablePlayerId(
  claim: (candidate: string) => Promise<boolean>,
  random: () => number = secureRandom,
  maxAttempts = PLAYER_ID_MAX_ATTEMPTS,
): Promise<string> {
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const candidate = generateReadablePlayerId(random);
    if (await claim(candidate)) return candidate;
  }
  throw new Error('Could not allocate a unique player ID.');
}
