import type { ccc } from "@ckb-ccc/core";

export const DEMO_ASSET = "CT" as const;
export const DEMO_DENOMINATION = 100n;
export const DEFAULT_DEMO_POOL_ID = "obscell-demo-100-ct";
export const MASKED_ARTIFACT_VALUE = "0x********";

export type PrivacyConsumerId = "reference-wallet" | "payment-app";
export type PrivacyCapabilityState = "available" | "simulated" | "unavailable";
export type PrivacyExecutionMode = "simulation" | "live";
export type PrivacyDataSource = "live-ccc" | "local" | "simulation";

export interface PrivacyCapabilities {
  cccFoundation: true;
  asset: typeof DEMO_ASSET;
  fixedDenomination: typeof DEMO_DENOMINATION;
  shield: PrivacyCapabilityState;
  privateBalance: PrivacyCapabilityState;
  privatePayment: PrivacyCapabilityState;
  unshield: PrivacyCapabilityState;
  liveSettlement: false;
  limitations: readonly string[];
}

export interface PrivateBalance {
  poolId: string;
  asset: typeof DEMO_ASSET;
  denomination: typeof DEMO_DENOMINATION;
  amount: bigint;
  availableNotes: number;
  source: "simulation";
}

export type PrivacyOperationKind = "shield" | "unshield";
export type PrivacyOperationPurpose =
  | "fund-private-balance"
  | "recipient-payment"
  | "return-public";
export type PrivacyOperationStatus =
  | "preparing"
  | "ready-for-signing"
  | "simulation-complete"
  | "failed";

export type PrivacyPipelineStepId =
  | "intent"
  | "privacy-state"
  | "commitment"
  | "proof"
  | "ccc-transaction"
  | "signer"
  | "confirmation";
export type PrivacyPipelineStepStatus =
  | "queued"
  | "active"
  | "complete"
  | "ready"
  | "skipped"
  | "failed";

export interface PrivacyPipelineStep {
  id: PrivacyPipelineStepId;
  status: PrivacyPipelineStepStatus;
  source: "simulation";
}

export interface PrivacyOperation {
  id: string;
  sequence: number;
  consumer: PrivacyConsumerId;
  poolId: string;
  kind: PrivacyOperationKind;
  purpose: PrivacyOperationPurpose;
  execution: "simulation";
  status: PrivacyOperationStatus;
  amount: typeof DEMO_DENOMINATION;
  recipient?: string;
  noteId?: string;
  steps: readonly PrivacyPipelineStep[];
  error?: string;
}

export type DemoPrivateNoteStatus = "available" | "spent";

export interface DemoPrivateNote {
  id: string;
  poolId: string;
  denomination: typeof DEMO_DENOMINATION;
  status: DemoPrivateNoteStatus;
  displayValue: typeof MASKED_ARTIFACT_VALUE;
  source: "simulation";
}

export type PrivacyArtifactId =
  | "note"
  | "commitment"
  | "nullifier"
  | "merkle-membership"
  | "proof"
  | "recipient";
export type PrivacyArtifactStatus =
  | "idle"
  | "encrypted"
  | "generated"
  | "protected"
  | "modeled"
  | "bound";

export interface PrivacyArtifact {
  id: PrivacyArtifactId;
  label: string;
  status: PrivacyArtifactStatus;
  displayValue: typeof MASKED_ARTIFACT_VALUE;
  source: "simulation";
}

export interface DemoPrivacySnapshot {
  revision: number;
  poolId: string;
  asset: typeof DEMO_ASSET;
  denomination: typeof DEMO_DENOMINATION;
  execution: "simulation";
  publicBalance: bigint;
  privateBalance: bigint;
  notes: readonly DemoPrivateNote[];
  artifacts: readonly PrivacyArtifact[];
  operations: readonly PrivacyOperation[];
  activeOperationId?: string;
}

export interface PrivacySyncInput {
  poolId: string;
}

export interface PrivateBalanceInput {
  poolId: string;
}

export interface ShieldInput {
  poolId: string;
  consumer: PrivacyConsumerId;
  signer?: ccc.Signer;
}

export interface UnshieldInput {
  poolId: string;
  consumer: PrivacyConsumerId;
  noteId: string;
  recipient: string;
  purpose: "recipient-payment" | "return-public";
  signer?: ccc.Signer;
}

export type PrivacyStateListener = (snapshot: DemoPrivacySnapshot) => void;
export type PrivacyUnsubscribe = () => void;

export interface PrivacyClient {
  getCapabilities(): Promise<PrivacyCapabilities>;
  sync(input: PrivacySyncInput): Promise<void>;
  getPrivateBalance(input: PrivateBalanceInput): Promise<PrivateBalance>;
  shield(input: ShieldInput): Promise<PrivacyOperation>;
  unshield(input: UnshieldInput): Promise<PrivacyOperation>;
  getOperation(id: string): Promise<PrivacyOperation>;
  getSnapshot(): DemoPrivacySnapshot;
  subscribe(listener: PrivacyStateListener): PrivacyUnsubscribe;
}

export interface DemoPrivacyController extends PrivacyClient {
  reset(): void;
}

export interface DemoPrivacyClientOptions {
  poolId?: string;
  transitionDelayMs?: number;
}
