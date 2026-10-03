import { AESEncryptionKey, AESKeySize, AESSealedData, aesDecryptAsync, aesEncryptAsync } from 'expo-crypto';

const FORMAT = new Uint8Array([0x53, 0x50, 0x56, 0x31]); // SPV1
const IV_LENGTH = 12;
const TAG_LENGTH = 16;

export type VaultCrypto = {
  generateKey(): Promise<string>;
  encrypt(plaintext: Uint8Array, keyBase64: string, associatedData: string): Promise<Uint8Array>;
  decrypt(ciphertext: Uint8Array, keyBase64: string, associatedData: string): Promise<Uint8Array>;
};

function concat(first: Uint8Array, second: Uint8Array): Uint8Array {
  const output = new Uint8Array(first.length + second.length);
  output.set(first);
  output.set(second, first.length);
  return output;
}

function associatedDataBytes(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

/** AES-256-GCM with a fresh 96-bit nonce, 128-bit tag, format marker, and bound metadata. */
export const expoVaultCrypto: VaultCrypto = {
  async generateKey() {
    return (await AESEncryptionKey.generate(AESKeySize.AES256)).encoded('base64');
  },
  async encrypt(plaintext, keyBase64, associatedData) {
    const key = await AESEncryptionKey.import(keyBase64, 'base64');
    const sealed = await aesEncryptAsync(plaintext, key, {
      nonce: { length: IV_LENGTH },
      tagLength: TAG_LENGTH,
      additionalData: associatedDataBytes(associatedData),
    });
    return concat(FORMAT, await sealed.combined());
  },
  async decrypt(ciphertext, keyBase64, associatedData) {
    if (ciphertext.length < FORMAT.length + IV_LENGTH + TAG_LENGTH || !FORMAT.every((byte, index) => ciphertext[index] === byte)) {
      throw new Error('Le fichier du coffre est invalide ou corrompu.');
    }
    const key = await AESEncryptionKey.import(keyBase64, 'base64');
    const sealed = AESSealedData.fromCombined(ciphertext.subarray(FORMAT.length), { ivLength: IV_LENGTH, tagLength: TAG_LENGTH });
    return aesDecryptAsync(sealed, key, { additionalData: associatedDataBytes(associatedData) });
  },
};
