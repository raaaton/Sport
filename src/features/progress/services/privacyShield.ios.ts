import { requireOptionalNativeModule } from 'expo';

type NativePrivacyModule = { setPrivacyShieldVisible: (visible: boolean) => void };
const nativeModule = requireOptionalNativeModule<NativePrivacyModule>('SportVaultFileProtection');

export function setNativePrivacyShield(visible: boolean): void {
  nativeModule?.setPrivacyShieldVisible(visible);
}
