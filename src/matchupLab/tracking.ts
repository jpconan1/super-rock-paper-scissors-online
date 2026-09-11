import { ABM_CLASSES } from '../variants/attackBlockMana/attackBlockManaCatalog';
import { ABM_CLASS_IDS, type AbmClassId } from '../variants/attackBlockMana/attackBlockManaTypes';

export interface MatchupReview { tested: boolean; interactions: Record<string, boolean> }
export interface MatchupLabData { schemaVersion: 1; records: Record<string, MatchupReview> }
export interface InteractionItem { id: string; label: string }

const CLASS_IDS = new Set<string>(ABM_CLASS_IDS);

export function matchupKey(yours: AbmClassId, opponent: AbmClassId): string { return `${yours}:${opponent}`; }

export function allMatchupKeys(): string[] {
  return ABM_CLASS_IDS.flatMap((yours) => ABM_CLASS_IDS.map((opponent) => matchupKey(yours, opponent)));
}

export function interactionItems(yours: AbmClassId, opponent: AbmClassId): InteractionItem[] {
  const yourClass = ABM_CLASSES.find(({ id }) => id === yours)!;
  const opponentClass = ABM_CLASSES.find(({ id }) => id === opponent)!;
  const baseline = { id: 'baseline', label: 'Normal matchup' };
  if (yours === opponent) return [baseline, { id: `class:${yours}`, label: `${yourClass.name}: ${yourClass.description}` }];
  return [baseline,
    { id: `yours:${yours}`, label: `Your ${yourClass.name}: ${yourClass.description}` },
    { id: `opponent:${opponent}`, label: `Opponent ${opponentClass.name}: ${opponentClass.description}` },
  ];
}

export function reviewFor(data: MatchupLabData, yours: AbmClassId, opponent: AbmClassId): MatchupReview {
  return data.records[matchupKey(yours, opponent)] ?? { tested: false, interactions: {} };
}

export function normalizeMatchupLabData(value: unknown): MatchupLabData {
  if (!value || typeof value !== 'object' || (value as { schemaVersion?: unknown }).schemaVersion !== 1) throw new Error('Invalid matchup lab schema.');
  const records = (value as { records?: unknown }).records;
  if (!records || typeof records !== 'object' || Array.isArray(records)) throw new Error('Invalid matchup lab records.');
  const normalized: Record<string, MatchupReview> = {};
  for (const [key, raw] of Object.entries(records)) {
    const parts = key.split(':');
    if (parts.length !== 2 || !CLASS_IDS.has(parts[0]!) || !CLASS_IDS.has(parts[1]!)) throw new Error(`Unknown matchup ${key}.`);
    if (!raw || typeof raw !== 'object' || typeof (raw as { tested?: unknown }).tested !== 'boolean') throw new Error(`Invalid review ${key}.`);
    const interactions = (raw as { interactions?: unknown }).interactions;
    if (!interactions || typeof interactions !== 'object' || Array.isArray(interactions)
      || Object.values(interactions).some((checked) => typeof checked !== 'boolean')) throw new Error(`Invalid interactions ${key}.`);
    const allowedInteractions = new Set(interactionItems(parts[0] as AbmClassId, parts[1] as AbmClassId).map(({ id }) => id));
    if (Object.keys(interactions).some((id) => !allowedInteractions.has(id))) throw new Error(`Unknown interaction in ${key}.`);
    normalized[key] = { tested: (raw as MatchupReview).tested, interactions: { ...(interactions as Record<string, boolean>) } };
  }
  return { schemaVersion: 1, records: normalized };
}
