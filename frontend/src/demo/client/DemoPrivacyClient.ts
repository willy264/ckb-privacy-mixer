import {
  DEFAULT_DEMO_POOL_ID,
  DEMO_ASSET,
  DEMO_DENOMINATION,
  MASKED_ARTIFACT_VALUE,
  type DemoPrivateNote,
  type DemoPrivacyClientOptions,
  type DemoPrivacyController,
  type DemoPrivacySnapshot,
  type PrivateBalance,
  type PrivateBalanceInput,
  type PrivacyArtifact,
  type PrivacyArtifactId,
  type PrivacyArtifactStatus,
  type PrivacyCapabilities,
  type PrivacyOperation,
  type PrivacyOperationPurpose,
  type PrivacyPipelineStep,
  type PrivacyPipelineStepId,
  type PrivacyPipelineStepStatus,
  type PrivacyStateListener,
  type PrivacySyncInput,
  type ShieldInput,
  type UnshieldInput,
} from "../types";

const CAPABILITIES: PrivacyCapabilities = {
  cccFoundation: true,
  asset: DEMO_ASSET,
  fixedDenomination: DEMO_DENOMINATION,
  shield: "simulated",
  privateBalance: "simulated",
  privatePayment: "simulated",
  unshield: "simulated",
  liveSettlement: false,
  limitations: [
    "Concept simulation only; no CKB transaction is submitted.",
    "The protocol-correct V1 uses one fixed 100 CT denomination.",
    "Private payment is a preview of an unshield-to-recipient flow, not a private-to-private transfer.",
  ],
};

const ARTIFACT_LABELS: Record<PrivacyArtifactId, string> = {
  note: "Encrypted note",
  commitment: "Commitment",
  nullifier: "Protected nullifier",
  "merkle-membership": "Merkle membership",
  proof: "Proof",
  recipient: "Bound recipient",
};

const PIPELINE_STEP_IDS: readonly PrivacyPipelineStepId[] = [
  "intent",
  "privacy-state",
  "commitment",
  "proof",
  "ccc-transaction",
  "signer",
  "confirmation",
];

class ResetDuringOperationError extends Error {
  constructor() {
    super("The demo was reset before the operation completed.");
  }
}

function cloneStep(step: PrivacyPipelineStep): PrivacyPipelineStep {
  return { ...step };
}

function cloneOperation(operation: PrivacyOperation): PrivacyOperation {
  return {
    ...operation,
    steps: operation.steps.map(cloneStep),
  };
}

function cloneNote(note: DemoPrivateNote): DemoPrivateNote {
  return { ...note };
}

function cloneArtifact(artifact: PrivacyArtifact): PrivacyArtifact {
  return { ...artifact };
}

function initialArtifacts(): PrivacyArtifact[] {
  return (Object.keys(ARTIFACT_LABELS) as PrivacyArtifactId[]).map((id) => ({
    id,
    label: ARTIFACT_LABELS[id],
    status: "idle",
    displayValue: MASKED_ARTIFACT_VALUE,
    source: "simulation",
  }));
}

function initialSteps(): PrivacyPipelineStep[] {
  return PIPELINE_STEP_IDS.map((id) => ({
    id,
    status: "queued",
    source: "simulation",
  }));
}

export class DemoPrivacyClient implements DemoPrivacyController {
  private readonly poolId: string;
  private readonly transitionDelayMs: number;
  private readonly listeners = new Set<PrivacyStateListener>();
  private revision = 0;
  private operationSequence = 0;
  private noteSequence = 0;
  private resetEpoch = 0;
  private publicBalance = DEMO_DENOMINATION;
  private privateBalance = 0n;
  private notes: DemoPrivateNote[] = [];
  private artifacts = initialArtifacts();
  private operations: PrivacyOperation[] = [];
  private activeOperationId: string | undefined;

  constructor(options: DemoPrivacyClientOptions = {}) {
    this.poolId = options.poolId?.trim() || DEFAULT_DEMO_POOL_ID;
    this.transitionDelayMs = Math.max(0, options.transitionDelayMs ?? 180);
  }

  async getCapabilities(): Promise<PrivacyCapabilities> {
    return {
      ...CAPABILITIES,
      limitations: [...CAPABILITIES.limitations],
    };
  }

  async sync(input: PrivacySyncInput): Promise<void> {
    this.assertPool(input.poolId);
    await this.pause(this.resetEpoch);
    this.publish();
  }

  async getPrivateBalance(input: PrivateBalanceInput): Promise<PrivateBalance> {
    this.assertPool(input.poolId);
    return {
      poolId: this.poolId,
      asset: DEMO_ASSET,
      denomination: DEMO_DENOMINATION,
      amount: this.privateBalance,
      availableNotes: this.notes.filter((note) => note.status === "available").length,
      source: "simulation",
    };
  }

  async shield(input: ShieldInput): Promise<PrivacyOperation> {
    this.assertPool(input.poolId);
    this.assertNoActiveOperation();
    if (this.publicBalance < DEMO_DENOMINATION) {
      throw new Error("The demo account does not have an available 100 CT public note to shield.");
    }

    const epoch = this.resetEpoch;
    const operation = this.createOperation(input.consumer, "shield", "fund-private-balance");

    try {
      await this.completeStep(operation, "intent", epoch);
      await this.completeStep(operation, "privacy-state", epoch);
      await this.completeStep(operation, "commitment", epoch);
      this.setArtifactStatus("note", "encrypted");
      this.setArtifactStatus("commitment", "generated");
      this.setArtifactStatus("nullifier", "protected");
      this.setArtifactStatus("merkle-membership", "modeled");
      this.publish();

      this.setStepStatus(operation, "proof", "skipped");
      await this.completeStep(operation, "ccc-transaction", epoch);
      this.setStepStatus(operation, "signer", "skipped");
      this.setStepStatus(operation, "confirmation", "skipped");

      this.publicBalance -= DEMO_DENOMINATION;
      this.privateBalance += DEMO_DENOMINATION;
      this.noteSequence += 1;
      const note: DemoPrivateNote = {
        id: `demo-note-${this.noteSequence}`,
        poolId: this.poolId,
        denomination: DEMO_DENOMINATION,
        status: "available",
        displayValue: MASKED_ARTIFACT_VALUE,
        source: "simulation",
      };
      this.notes.push(note);
      operation.noteId = note.id;
      operation.status = "simulation-complete";
      this.finishOperation(operation);
      return cloneOperation(operation);
    } catch (error) {
      return this.failOrRethrowReset(operation, error);
    }
  }

  async unshield(input: UnshieldInput): Promise<PrivacyOperation> {
    this.assertPool(input.poolId);
    this.assertNoActiveOperation();
    const recipient = input.recipient.trim();
    if (!recipient) {
      throw new Error("A recipient CKB address is required.");
    }

    const note = this.notes.find((candidate) => candidate.id === input.noteId);
    if (!note) {
      throw new Error(`Unknown demo note: ${input.noteId}`);
    }
    if (note.status !== "available") {
      throw new Error(`Demo note ${input.noteId} has already been consumed.`);
    }

    const epoch = this.resetEpoch;
    const operation = this.createOperation(input.consumer, "unshield", input.purpose, {
      noteId: note.id,
      recipient,
    });

    try {
      await this.completeStep(operation, "intent", epoch);
      await this.completeStep(operation, "privacy-state", epoch);
      this.setStepStatus(operation, "commitment", "complete");
      await this.completeStep(operation, "proof", epoch);
      this.setArtifactStatus("proof", "generated");
      this.setArtifactStatus("recipient", "bound");
      this.setArtifactStatus("nullifier", "protected");
      this.publish();
      await this.completeStep(operation, "ccc-transaction", epoch);

      if (input.purpose === "recipient-payment") {
        this.setStepStatus(operation, "signer", "ready");
        this.setStepStatus(operation, "confirmation", "skipped");
        operation.status = "ready-for-signing";
        this.finishOperation(operation);
        return cloneOperation(operation);
      }

      this.setStepStatus(operation, "signer", "skipped");
      this.setStepStatus(operation, "confirmation", "skipped");
      note.status = "spent";
      this.privateBalance -= DEMO_DENOMINATION;
      this.publicBalance += DEMO_DENOMINATION;
      operation.status = "simulation-complete";
      this.finishOperation(operation);
      return cloneOperation(operation);
    } catch (error) {
      return this.failOrRethrowReset(operation, error);
    }
  }

  async getOperation(id: string): Promise<PrivacyOperation> {
    const operation = this.operations.find((candidate) => candidate.id === id);
    if (!operation) {
      throw new Error(`Unknown demo privacy operation: ${id}`);
    }
    return cloneOperation(operation);
  }

  getSnapshot(): DemoPrivacySnapshot {
    return {
      revision: this.revision,
      poolId: this.poolId,
      asset: DEMO_ASSET,
      denomination: DEMO_DENOMINATION,
      execution: "simulation",
      publicBalance: this.publicBalance,
      privateBalance: this.privateBalance,
      notes: this.notes.map(cloneNote),
      artifacts: this.artifacts.map(cloneArtifact),
      operations: this.operations.map(cloneOperation),
      activeOperationId: this.activeOperationId,
    };
  }

  subscribe(listener: PrivacyStateListener): () => void {
    this.listeners.add(listener);
    listener(this.getSnapshot());
    return () => {
      this.listeners.delete(listener);
    };
  }

  reset(): void {
    this.resetEpoch += 1;
    this.revision = 0;
    this.operationSequence = 0;
    this.noteSequence = 0;
    this.publicBalance = DEMO_DENOMINATION;
    this.privateBalance = 0n;
    this.notes = [];
    this.artifacts = initialArtifacts();
    this.operations = [];
    this.activeOperationId = undefined;
    this.publish();
  }

  private createOperation(
    consumer: ShieldInput["consumer"],
    kind: PrivacyOperation["kind"],
    purpose: PrivacyOperationPurpose,
    detail: Pick<PrivacyOperation, "noteId" | "recipient"> = {},
  ): PrivacyOperation {
    this.operationSequence += 1;
    const operation: PrivacyOperation = {
      id: `demo-operation-${this.operationSequence}`,
      sequence: this.operationSequence,
      consumer,
      poolId: this.poolId,
      kind,
      purpose,
      execution: "simulation",
      status: "preparing",
      amount: DEMO_DENOMINATION,
      steps: initialSteps(),
      ...detail,
    };
    this.setStepStatus(operation, "intent", "active");
    this.operations.push(operation);
    this.activeOperationId = operation.id;
    this.publish();
    return operation;
  }

  private async completeStep(
    operation: PrivacyOperation,
    id: PrivacyPipelineStepId,
    epoch: number,
  ): Promise<void> {
    this.setStepStatus(operation, id, "active");
    this.publish();
    await this.pause(epoch);
    this.setStepStatus(operation, id, "complete");
    this.publish();
  }

  private setStepStatus(
    operation: PrivacyOperation,
    id: PrivacyPipelineStepId,
    status: PrivacyPipelineStepStatus,
  ): void {
    operation.steps = operation.steps.map((step) =>
      step.id === id ? { ...step, status } : step,
    );
  }

  private setArtifactStatus(id: PrivacyArtifactId, status: PrivacyArtifactStatus): void {
    this.artifacts = this.artifacts.map((artifact) =>
      artifact.id === id ? { ...artifact, status } : artifact,
    );
  }

  private finishOperation(operation: PrivacyOperation): void {
    if (this.activeOperationId === operation.id) {
      this.activeOperationId = undefined;
    }
    this.publish();
  }

  private failOrRethrowReset(operation: PrivacyOperation, error: unknown): never {
    if (error instanceof ResetDuringOperationError) {
      throw error;
    }
    operation.status = "failed";
    operation.error = error instanceof Error ? error.message : "The simulated operation failed.";
    if (this.activeOperationId === operation.id) {
      this.activeOperationId = undefined;
    }
    this.publish();
    throw error;
  }

  private assertPool(poolId: string): void {
    if (poolId !== this.poolId) {
      throw new Error(`Unknown demo pool: ${poolId}`);
    }
  }

  private assertNoActiveOperation(): void {
    if (this.activeOperationId) {
      throw new Error(`Demo privacy operation ${this.activeOperationId} is still in progress.`);
    }
  }

  private async pause(epoch: number): Promise<void> {
    if (this.transitionDelayMs > 0) {
      await new Promise<void>((resolve) => {
        globalThis.setTimeout(resolve, this.transitionDelayMs);
      });
    }
    if (epoch !== this.resetEpoch) {
      throw new ResetDuringOperationError();
    }
  }

  private publish(): void {
    this.revision += 1;
    const snapshot = this.getSnapshot();
    for (const listener of this.listeners) {
      try {
        listener(snapshot);
      } catch {
        // A view listener must not interrupt the simulated protocol state machine.
      }
    }
  }
}

export function createDemoPrivacyClient(
  options: DemoPrivacyClientOptions = {},
): DemoPrivacyClient {
  return new DemoPrivacyClient(options);
}
