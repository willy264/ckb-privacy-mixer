import { createRelayerApp } from './server.js';

const port = Number(process.env.PORT) || Number(process.env.RELAYER_PORT) || 4000;

createRelayerApp().listen(port, '0.0.0.0', () => {
    console.log(`Relayer on ${port}`);
});
