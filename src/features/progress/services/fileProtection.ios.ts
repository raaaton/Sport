import { requireOptionalNativeModule } from 'expo';

type VaultFileProtectionNativeModule = {
  protectPath: (fileUri: string) => void;
};

const nativeModule = requireOptionalNativeModule<VaultFileProtectionNativeModule>('SportVaultFileProtection');

export async function protectVaultPath(fileUri: string): Promise<void> {
  if (!nativeModule) throw new Error('Une version de Sport avec le module de protection du coffre est requise.');
  await nativeModule.protectPath(fileUri);
}
