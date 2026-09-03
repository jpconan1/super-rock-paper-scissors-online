import { describe, expect, test } from 'vitest';
import type { PlayerId } from '../src/core/variant';
import { GUN_KNIFE_FIST_GAME_RESULT_HOLD_MS, GUN_KNIFE_FIST_READY_SPLIT_MS, GUN_KNIFE_FIST_REVEAL_MS, GUN_KNIFE_FIST_WAITING_MS, gunKnifeFistRules, hitWinnerForGunKnifeFist } from '../src/variants/gunKnifeFist/gunKnifeFistRules';
import type { GunKnifeFistMove, GunKnifeFistState } from '../src/variants/gunKnifeFist/gunKnifeFistTypes';

const context = { now: 1_000, random: () => 0.5 };

describe('Gun Knife Fist authoritative rules', () => {
  test.each([
    ['punch','shoot','p1'], ['shoot','punch','p2'], ['shoot','stab','p1'],
    ['stab','shoot','p2'], ['stab','punch','p1'], ['punch','stab','p2'],
    ['punch','punch',undefined], ['stab','stab',undefined], ['shoot','shoot',undefined],
  ] as const)('resolves %s against %s', (p1,p2,winner) => expect(hitWinnerForGunKnifeFist(p1,p2)).toBe(winner));

  test('starts every round at 3 health and applies 1/2/3 damage', () => {
    let state = gunKnifeFistRules.initialize(context);
    expect(state.resources).toEqual({p1:3,p2:3});
    state = turn(state, 'punch', 'shoot'); expect(state).toMatchObject({resources:{p1:3,p2:2},phase:'choosing',turn:2});
    state = turn(state, 'stab', 'punch'); expect(state).toMatchObject({resources:{p1:3,p2:0},phase:'round-result',score:{p1:1,p2:0}});
    state = continueBoth(state); expect(state).toMatchObject({resources:{p1:3,p2:3},round:2,turn:1});
    state = turn(state, 'shoot', 'stab'); expect(state.resources.p2).toBe(0);
  });

  test('keeps early move private and exposes readiness only', () => {
    const state = choose(gunKnifeFistRules.initialize(context), 'p1', 'shoot');
    expect(gunKnifeFistRules.project(state,'p1')).toMatchObject({ownPendingMove:'shoot'});
    expect(gunKnifeFistRules.project(state,'p2')).toMatchObject({opponentReady:true,legalMoves:['punch','stab','shoot']});
    expect(gunKnifeFistRules.project(state,'p2')).not.toHaveProperty('ownPendingMove');
  });

  test('owns move and Continue deadlines server-side', () => {
    let state = choose(gunKnifeFistRules.initialize(context),'p2','stab');
    expect(state.waitingStartsAt).toBe(context.now + GUN_KNIFE_FIST_READY_SPLIT_MS);
    expect(state.waitingDeadlineAt).toBe(context.now + GUN_KNIFE_FIST_READY_SPLIT_MS + GUN_KNIFE_FIST_WAITING_MS);
    state = gunKnifeFistRules.advanceDeadline!(state,{...context,now:state.waitingDeadlineAt!})!.state;
    expect(state).toMatchObject({phase:'complete',winner:'p2',resultReason:'forfeit'});

    state = turn(gunKnifeFistRules.initialize(context),'shoot','stab');
    expect(() => gunKnifeFistRules.resolve(state,'p1',{type:'continue'},{...context,now:state.resultRevealAt!-1})).toThrow('not available');
  });

  test('requires both Continue and holds final game result', () => {
    let state = gunKnifeFistRules.initialize(context);
    for (let i=0;i<3;i++) { state=turn(state,'shoot','stab'); if(i<2) state=continueBoth(state); }
    expect(state.phase).toBe('game-result'); expect(gunKnifeFistRules.result(state)).toBeUndefined();
    expect(state.gameCompleteAt).toBe(context.now+GUN_KNIFE_FIST_REVEAL_MS+GUN_KNIFE_FIST_GAME_RESULT_HOLD_MS);
    state=gunKnifeFistRules.advanceDeadline!(state,{...context,now:state.gameCompleteAt!})!.state;
    expect(gunKnifeFistRules.result(state)).toEqual({winner:'p1',scores:{p1:3,p2:0}});
  });
});
function choose(state:GunKnifeFistState,player:PlayerId,move:GunKnifeFistMove){return gunKnifeFistRules.resolve(state,player,{type:'choose-move',move},context).state;}
function turn(state:GunKnifeFistState,p1:GunKnifeFistMove,p2:GunKnifeFistMove){return choose(choose(state,'p1',p1),'p2',p2);}
function continueBoth(state:GunKnifeFistState){const now=state.resultRevealAt!;state=gunKnifeFistRules.resolve(state,'p1',{type:'continue'},{...context,now}).state;return gunKnifeFistRules.resolve(state,'p2',{type:'continue'},{...context,now}).state;}
