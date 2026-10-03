import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';
import { frameEncryptedContent, unframeEncryptedContent, vaultAssociatedData, VAULT_GCM_NONCE_BYTES, VAULT_GCM_TAG_BYTES } from './vaultCipherFormat';

export type VaultCrypto = {
  generateKey(): Promise<string>;
  encrypt(plaintext: Uint8Array, keyBase64: string, associatedData: string): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array, keyBase64: string, associatedData: string): Promise<Uint8Array>;
};

/** AES-256-GCM with a fresh 96-bit nonce, 128-bit tag, format marker, and bound metadata. */
export const expoVaultCrypto: VaultCrypto = {
  async generateKey() {
    return (await AESEncryptionKey.generate(AESKeySize.AES256)).encoded('base64');
  },
  async encrypt(plaintext, keyBase64, associatedData) {
    const key = await AESEncryptionKey.import(keyBase64, 'base64');
    const sealed = await aesEncryptAsync(plaintext, key, {
      nonce: { length: VAULT_GCM_NONCE_BYTES },
      tagLength: VAULT_GCM_TAG_BYTES,
      additionalData: vaultAssociatedData(...parseAssociatedData(associatedData)),
    });
    return frameEncryptedContent(await sealed.combined());
  },
  async decrypt(ciphertext, keyBase64, associatedData) {
    const key = await AESEncryptionKey.import(keyBase64, 'base64');
    const sealed = AESSealedData.fromCombined(unframeEncryptedContent(ciphertext), { ivLength: VAULT_GCM_NONCE_BYTES, tagLength: VAULT_GCM_TAG_BYTES });
    return aesDecryptAsync(sealed, key, { additionalData: vaultAssociatedData(...parseAssociatedData(associatedData)) });
  },
};

function parseAssociatedData(value: string): [string, string, 'original' | 'thumbnail'] {
  const match = /^sport-progress-vault:v1:([a-zA-Z0-9_-]{1,80}):(\d{4}-\d{2}-\d{2}):(original|thumbnail)$/.exec(value);
  if (!match) throw new Error('Les métadonnées authentifiées sont invalides.');
  return [match[1]!, match[2]!, match[3] as 'original' | 'thumbnail'];
}
