export type PrivacySdkErrorCode =
    | 'INVALID_ARGUMENT'
    | 'INVALID_ENCODING'
    | 'INVARIANT_VIOLATION'
    | 'UNSUPPORTED_OPERATION'
    | 'SIGNER_MISMATCH'
    | 'STATE_UNAVAILABLE'
    | 'STALE_STATE'
    | 'SERVICE_FAILURE';

export class PrivacySdkError extends Error {
    constructor(
        public readonly code: PrivacySdkErrorCode,
        message: string,
        public readonly details?: Readonly<Record<string, unknown>>,
        options?: ErrorOptions,
    ) {
        super(message, options);
        this.name = 'PrivacySdkError';
    }
}

export class InvalidArgumentError extends PrivacySdkError {
    constructor(message: string, details?: Readonly<Record<string, unknown>>) {
        super('INVALID_ARGUMENT', message, details);
        this.name = 'InvalidArgumentError';
    }
}

export class InvalidEncodingError extends PrivacySdkError {
    constructor(message: string, details?: Readonly<Record<string, unknown>>) {
        super('INVALID_ENCODING', message, details);
        this.name = 'InvalidEncodingError';
    }
}

export class InvariantViolationError extends PrivacySdkError {
    constructor(message: string, details?: Readonly<Record<string, unknown>>) {
        super('INVARIANT_VIOLATION', message, details);
        this.name = 'InvariantViolationError';
    }
}

export class UnsupportedOperationError extends PrivacySdkError {
    constructor(operation: string, reason: string) {
        super(
            'UNSUPPORTED_OPERATION',
            `${operation} is not available: ${reason}`,
            { operation },
        );
        this.name = 'UnsupportedOperationError';
    }
}

export class SignerMismatchError extends PrivacySdkError {
    constructor() {
        super(
            'SIGNER_MISMATCH',
            'The operation signer must be bound to the same injected CCC Client as PrivacyClient.',
        );
        this.name = 'SignerMismatchError';
    }
}

export class StateUnavailableError extends PrivacySdkError {
    constructor(message: string) {
        super('STATE_UNAVAILABLE', message);
        this.name = 'StateUnavailableError';
    }
}

export class StaleStateError extends PrivacySdkError {
    constructor(message: string, details?: Readonly<Record<string, unknown>>) {
        super('STALE_STATE', message, details);
        this.name = 'StaleStateError';
    }
}
