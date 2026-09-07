export type MatchSeat = 'p1' | 'p2';

export interface MatchTicket {
  matchId: string;
  seat: MatchSeat;
  token: string;
  expiresAt: number;
}

export function matchmakingTicketKey(guestId: string, attemptId: string): string {
  return `ticket:${guestId}:${attemptId}`;
}

export function recoverableMatchTicket(ticket: MatchTicket | undefined, now: number): MatchTicket | undefined {
  return ticket && ticket.expiresAt > now ? ticket : undefined;
}

export function createMatchTicketRecords(
  matchId: string,
  seats: Readonly<Record<MatchSeat, string>>,
  players: Readonly<Record<MatchSeat, { guestId: string; attemptId: string }>>,
  expiresAt: number,
): Record<string, MatchTicket> {
  return {
    [matchmakingTicketKey(players.p1.guestId, players.p1.attemptId)]: { matchId, seat: 'p1', token: seats.p1, expiresAt },
    [matchmakingTicketKey(players.p2.guestId, players.p2.attemptId)]: { matchId, seat: 'p2', token: seats.p2, expiresAt },
  };
}
