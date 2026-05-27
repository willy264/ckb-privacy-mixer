import path from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '..');

// Load repo-level deployment/runtime config first, then allow backend/.env to override service-specific values.
dotenvConfig({ path: path.resolve(repoRoot, '.env') });
dotenvConfig({ path: path.resolve(backendRoot, '.env'), override: true });
