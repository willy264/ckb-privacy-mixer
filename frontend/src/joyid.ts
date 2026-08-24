import { ccc } from '@ckb-ccc/core';
import { JoyId } from '@ckb-ccc/joy-id';

function getCkbNetwork() {
  return (import.meta as any).env?.VITE_CKB_NETWORK === 'mainnet' ? 'mainnet' : 'testnet';
}

function getRpcUrl() {
  const envRpc = (import.meta as any).env?.VITE_CKB_RPC_URL as string | undefined;
  if (envRpc) {
    return envRpc;
  }
  return getCkbNetwork() === 'mainnet'
    ? 'https://mainnet.ckb.dev/rpc'
    : 'https://testnet.ckb.dev/rpc';
}

function createClient() {
  const rpcUrl = getRpcUrl();
  if (getCkbNetwork() === 'mainnet') {
    return new ccc.ClientPublicMainnet({ url: rpcUrl });
  }
  return new ccc.ClientPublicTestnet({ url: rpcUrl });
}

function getJoyIdAppUrl() {
  return getCkbNetwork() === 'mainnet'
    // ? 'https://app.joyid.dev'
    ? 'https://app.joy.id'
    : 'https://testnet.joyid.dev';
}

let cachedSigner: InstanceType<typeof JoyId.CkbSigner> | null = null;

export function initializeJoyId() {
  // CCC JoyID signer handles runtime connection lazily.
}

function createSigner() {
  return new JoyId.CkbSigner(
    createClient(),
    'Obscell Privacy',
    'https://fav.farm/CKB',
    getJoyIdAppUrl(),
  );
}

async function ensureSignerConnected() {
  const signer = cachedSigner ?? createSigner();
  const connected = await signer.isConnected().catch(() => false);
  if (!connected) {
    await signer.connect();
  }
  cachedSigner = signer;
  return signer;
}

export async function connectJoyIdWallet() {
  const signer = await ensureSignerConnected();
  return signer.getRecommendedAddress();
}

export async function signTransactionWithJoyId(txLike: unknown) {
  const signer = await ensureSignerConnected();
  const tx = ccc.Transaction.from(txLike as any);
  return signer.signTransaction(tx);
}

export function disconnectJoyIdWallet() {
  const signer = cachedSigner;
  cachedSigner = null;
  void signer?.disconnect().catch(() => undefined);
}
