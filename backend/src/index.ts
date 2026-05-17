import 'dotenv/config';
import { createRelayerApp } from './relayer/server.js';
import { createCoordinatorServer } from './coordinator/server.js';
import { logger } from './utils/logger.js';

const RELAYER_PORT  = Number(process.env.RELAYER_PORT)  || 4000;
const COORDINATOR_PORT = Number(process.env.COORDINATOR_PORT) || 4001;

async function main() {
    // ── Relayer HTTP server ───────────────────────────────────────────────────
    const relayerApp = createRelayerApp();
    relayerApp.listen(RELAYER_PORT, () => {
        logger.info(`[Relayer] HTTP server listening on port ${RELAYER_PORT}`);
    });

    // ── Coordinator WebSocket server ──────────────────────────────────────────
    const coordinatorServer = createCoordinatorServer();
    coordinatorServer.listen(COORDINATOR_PORT, () => {
        logger.info(`[Coordinator] WS server listening on port ${COORDINATOR_PORT}`);
    });
}

main().catch(err => {
    logger.error('Fatal startup error', { error: String(err) });
    process.exit(1);
});
