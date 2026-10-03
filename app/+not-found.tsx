import { Link, Stack } from 'expo-router';
import { StyleSheet } from 'react-native';

import { AppScreen } from '@/shared/ui/AppScreen';
import { AppText } from '@/shared/ui/AppText';

export default function NotFoundScreen() {
  return (
    <>
      <Stack.Screen options={{ title: 'Oops!' }} />
      <AppScreen>
        <AppText variant="title">Cette page n’existe pas.</AppText>

        <Link href="/" style={styles.link}>
          <AppText colorRole="accent" variant="callout">Retour à aujourd’hui</AppText>
        </Link>
      </AppScreen>
    </>
  );
}

const styles = StyleSheet.create({
  link: {
    marginTop: 20,
    paddingVertical: 12,
  },
});
