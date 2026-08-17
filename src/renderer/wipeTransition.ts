export type CoveredSwap = () => void | Promise<void>;

export interface WipeTransition {
  transition(swap: CoveredSwap, signal?: AbortSignal): Promise<void>;
}
