import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';

type SettingsDetailScreenProps = {
  children: string;
};

export function SettingsDetailScreen({ children }: SettingsDetailScreenProps) {
  return (
    <AppScreen>
      <AppText colorRole="secondary" style={{ maxWidth: 520 }} variant="body">
        {children}
      </AppText>
    </AppScreen>
  );
}
