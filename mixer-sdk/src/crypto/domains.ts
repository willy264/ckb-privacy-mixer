import { asciiFieldTag } from './field.js';

export const V1_DOMAIN_TAGS = Object.freeze({
    leaf: asciiFieldTag('obscell/v1/leaf'),
    nullifier: asciiFieldTag('obscell/v1/nullifier'),
    auth: asciiFieldTag('obscell/v1/auth'),
    action: asciiFieldTag('obscell/v1/action'),
    pool: asciiFieldTag('obscell/v1/pool-domain'),
    asset: asciiFieldTag('obscell/v1/asset-domain'),
    recipient: asciiFieldTag('obscell/v1/recipient-domain'),
    recipientCtCommitment: asciiFieldTag('obscell/v1/recipient-commit'),
    recipientCtData: asciiFieldTag('obscell/v1/recipient-ct'),
    merkleEmpty: asciiFieldTag('obscell/v1/merkle-empty'),
    merkleNode: asciiFieldTag('obscell/v1/merkle-node'),
});
