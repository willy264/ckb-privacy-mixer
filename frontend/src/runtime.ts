import { loadMixerRuntimeConfig, type MixerRuntimeConfig } from 'mixer-sdk';

type EnvRecord = Record<string, string | undefined>;

export interface FrontendRuntimeStatus {
  config: MixerRuntimeConfig | null;
  error?: string;
}

function collectEnv(): EnvRecord {
  const env: EnvRecord = {};

  for (const [key, value] of Object.entries(import.meta.env)) {
    env[key] = typeof value === 'string' ? value : undefined;
  }

  return env;
}

export function tryLoadFrontendRuntimeConfig(): FrontendRuntimeStatus {
  try {
    return { config: loadMixerRuntimeConfig(collectEnv()) };
  } catch (error) {
    return {
      config: null,
      error: error instanceof Error ? error.message : 'Unable to read runtime config.',
    };
  }
}

export function getGroth16ArtifactUrls() {
  const baseUrl = new URL(import.meta.env.BASE_URL, window.location.origin);

  return {
    wasmPath: new URL('mixer_js/mixer.wasm', baseUrl).toString(),
    zkeyPath: new URL('mixer_final.zkey', baseUrl).toString(),
  };
}
