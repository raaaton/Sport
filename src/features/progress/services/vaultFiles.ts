import { Directory, File, Paths } from 'expo-file-system';
import { protectVaultPath } from './fileProtection';

const VAULT_DIRECTORY_NAME = 'sport-progress-vault';

export type VaultFiles = {
  write(id: string, encrypted: Uint8Array): Promise<void>;
  read(id: string): Promise<Uint8Array>;
  delete(id: string): Promise<void>;
  deleteAll(): Promise<void>;
  listIds(): Promise<string[]>;
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
    try {
      await protectVaultPath(directory.uri);
      await protectVaultPath(file.uri);
      file.write(encrypted);
    } catch (error) {
      if (file.exists) file.delete();
      throw error;
    }
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
  async listIds() {
    const directory = getDirectory();
    if (!directory.exists) return [];
    return directory.list().filter((entry): entry is File => entry instanceof File && entry.extension === '.spv').map((file) => file.name.slice(0, -4));
  },
  uri(id) {
    validateId(id);
    return new File(getDirectory(), `${id}.spv`).uri;
  },
};
