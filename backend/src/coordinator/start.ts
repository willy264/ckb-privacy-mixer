import { createCoordinatorServer } from './server.js';

const port = Number(process.env.PORT) || Number(process.env.COORDINATOR_PORT) || 4001;

createCoordinatorServer().listen(port, '0.0.0.0', () => {
    console.log(`Coordinator on ${port}`);
});
