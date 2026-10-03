export const VAULT_FORMAT_MARKER = new Uint8Array([0x53, 0x50, 0x56, 0x31]); // SPV1
export const VAULT_GCM_NONCE_BYTES = 12;
export const VAULT_GCM_TAG_BYTES = 16;

export function vaultAssociatedData(photoId: string, date: string, role: 'original' | 'thumbnail'): Uint8Array {
  return new TextEncoder().encode(`sport-progress-vault:v1:${photoId}:${date}:${role}`);
}

export function frameEncryptedContent(combined: Uint8Array): Uint8Array {
  const framed = new Uint8Array(VAULT_FORMAT_MARKER.length + combined.length);
  framed.set(VAULT_FORMAT_MARKER);
  framed.set(combined, VAULT_FORMAT_MARKER.length);
  return framed;
}

export function unframeEncryptedContent(framed: Uint8Array): Uint8Array {
  const minimumLength = VAULT_FORMAT_MARKER.length + VAULT_GCM_NONCE_BYTES + VAULT_GCM_TAG_BYTES;
  if (framed.length < minimumLength || !VAULT_FORMAT_MARKER.every((byte, index) => framed[index] === byte)) {
    throw new Error('Le fichier du coffre est invalide ou corrompu.');
  }
  return framed.subarray(VAULT_FORMAT_MARKER.length);
}
