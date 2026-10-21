/** normalized result of one slip check, whatever the provider (R-002) */
export interface SlipFacts {
  transRef: string | null;
  /** baht as printed on the slip (may carry satang) */
  amount: number | null;
  /** masked bank account of the receiver, e.g. "xxx-x-x5678-x" */
  receiverAccount: string | null;
  /** masked PromptPay proxy of the receiver, e.g. "xxx-xxx-5678" */
  receiverProxy: string | null;
  receiverName: string | null;
  /** ISO time of the transfer when the provider gives one */
  at: string | null;
  /** the provider itself says the slip was checked before */
  duplicate: boolean;
}

export type SlipOutcome =
  | { kind: 'facts'; facts: SlipFacts }
  | { kind: 'error'; code: string; message: string; facts?: SlipFacts };

export type SlipProvider = 'slipok' | 'easyslip';

export interface SlipDecision {
  result: 'paid' | 'review';
  reason: string;
}
