import { Directory, File, Paths } from 'expo-file-system';
import { protectVaultPath } from './fileProtection';

const VAULT_DIRECTORY_NAME = 'sport-progress-vault';

export type VaultFiles = {
  write(id: string, encrypted: Uint8Array): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  uri(id: string): string;
};

function validateId(id: string): void {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(id)) throw new Error('Identifiant de fichier du coffre invalide.');
}

function getDirectory(): Directory {
  return new Directory(Paths.document, VAULT_DIRECTORY_NAME);
}

export const privateVaultFiles: VaultFiles = {
  async write(id, encrypted) {
    validateId(id);
    const directory = getDirectory();
    directory.create({ intermediates: true, idempotent: true });
    const file = new File(directory, `${id}.spv`);
    file.create({ intermediates: true, overwrite: true });
    file.write(encrypted);
    await protectVaultPath(directory.uri);
    await protectVaultPath(file.uri);
  },
  async read(id) {
    validateId(id);
    const file = new File(getDirectory(), `${id}.spv`);
    if (!file.exists) throw new Error('Un fichier chiffré du coffre est introuvable.');
    return file.bytes();
  },
  async delete(id) {
    validateId(id);
    const file = new File(getDirectory(), `${id}.spv`);
    if (file.exists) file.delete();
  },
  async deleteAll() {
    const directory = getDirectory();
    if (directory.exists) directory.delete();
  },
  uri(id) {
    validateId(id);
    return new File(getDirectory(), `${id}.spv`).uri;
  },
};
