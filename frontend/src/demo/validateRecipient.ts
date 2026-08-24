export async function validateCkbRecipientAddress(address: string): Promise<boolean> {
  const candidate = address.trim();
  if (!candidate) return false;

  const { ccc } = await import("@ckb-ccc/core");
  const isMainnet = (import.meta as any).env?.VITE_CKB_NETWORK === "mainnet";
  const configuredRpc = (import.meta as any).env?.VITE_CKB_RPC_URL as string | undefined;
  const url =
    configuredRpc ?? (isMainnet ? "https://mainnet.ckb.dev/rpc" : "https://testnet.ckb.dev/rpc");
  const client = isMainnet
    ? new ccc.ClientPublicMainnet({ url })
    : new ccc.ClientPublicTestnet({ url });

  try {
    await ccc.Address.fromString(candidate, client);
    return true;
  } catch {
    return false;
  }
}
