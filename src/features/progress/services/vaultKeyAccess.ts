export type PendingVaultKeyPorts = {
  read(keyId: string): Promise<string | null>;
  write(keyId: string, key: string): Promise<void>;
  generate(): Promise<string>;
};

export async function getPendingVaultKey(keyId: string, ports: PendingVaultKeyPorts): Promise<string> {
  let key = await ports.read(keyId);
  if (!key) {
    key = await ports.generate();
    await ports.write(keyId, key);
  }
  // The second read enforces biometric authentication before setup becomes configured.
  const authenticatedKey = await ports.read(keyId);
  if (!authenticatedKey) throw new Error('La clé du coffre est indisponible. Les fichiers chiffrés sont conservés.');
  return authenticatedKey;
}

export async function getConfiguredVaultKey(keyId: string, read: (id: string) => Promise<string | null>): Promise<string> {
  const key = await read(keyId);
  if (!key) throw new Error('La clé du coffre est inaccessible avec la biométrie actuelle. Les photos chiffrées sont conservées.');
  return key;
}
