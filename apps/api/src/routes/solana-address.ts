import { PublicKey } from "@solana/web3.js";

const NON_WALLET_ADDRESSES = new Set([
  "11111111111111111111111111111111",
  "So11111111111111111111111111111111111111112",
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
  "TokenzQdBNbLqP5VEhdkAS6wpFLc7DbLZ4K3e3oV261W",
  "JUP6LkbZbjS1jKKwapdHNy74zcZ3tLUZoi5QNyVTaV4",
]);

export function isValidSolanaWalletAddress(address: string) {
  if (NON_WALLET_ADDRESSES.has(address)) {
    return false;
  }

  try {
    const publicKey = new PublicKey(address);
    return PublicKey.isOnCurve(publicKey);
  } catch {
    return false;
  }
}
