import { useRouter, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { selectionHaptic } from '@/shared/haptics';
import { colors, radii, spacing } from '@/shared/theme/tokens';
import { useColorScheme } from '@/shared/theme/useColorScheme';
import { AppScreen } from '@/shared/ui/AppScreen';
import { AppSymbol } from '@/shared/ui/AppSymbol';
import { AppText } from '@/shared/ui/AppText';

type SettingsItem = {
  description: string;
  icon: Parameters<typeof AppSymbol>[0]['name'];
  route: string;
  title: string;
};

const sections: { items: SettingsItem[]; title: string }[] = [
  {
    title: 'Entraînement',
    items: [
      {
        title: 'Planning des séances',
        description: 'Jours, rappels et exercices',
        icon: 'calendar',
        route: '/settings/schedule',
      },
      {
        title: 'Exercices',
        description: 'Mouvements et suivi',
        icon: 'figure.strengthtraining.traditional',
        route: '/settings/exercises',
      },
      {
        title: 'Gestion du lest',
        description: 'Objets et charges disponibles',
        icon: 'scalemass',
        route: '/settings/weighted-items',
      },
      {
        title: 'Minuteur de repos',
        description: 'Durée entre les séries',
        icon: 'timer',
        route: '/settings/timer',
      },
    ],
  },
  {
    title: 'Rappels',
    items: [
      {
        title: 'Notifications',
        description: 'Séances et photos mensuelles',
        icon: 'bell',
        route: '/settings/notifications',
      },
    ],
  },
  {
    title: 'Application',
    items: [
      {
        title: 'Préférences',
        description: 'Apparence et options générales',
        icon: 'slider.horizontal.3',
        route: '/settings/preferences',
      },
      {
        title: 'À propos de Sport',
        description: 'Version et informations',
        icon: 'info.circle',
        route: '/settings/about',
      },
    ],
  },
  {
    title: 'Confidentialité',
    items: [
      {
        title: 'Coffre photo',
        description: 'Face ID et verrouillage automatique',
        icon: 'lock.shield',
        route: '/settings/vault',
      },
    ],
  },
];

export function SettingsScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();

  return (
    <AppScreen safeAreaEdges={['top', 'bottom']}>
      <AppText variant="largeTitle">Réglages</AppText>
      <AppText colorRole="secondary" style={styles.intro} variant="subheadline">
        Gérez votre programme et les préférences de Sport.
      </AppText>

      {sections.map((section) => (
        <View key={section.title} style={styles.section}>
          <AppText colorRole="secondary" style={styles.sectionTitle} variant="footnote">
            {section.title.toLocaleUpperCase('fr-FR')}
          </AppText>
          <View
            style={[
              styles.group,
              { backgroundColor: colors[colorScheme].groupedBackground },
            ]}
          >
            {section.items.map((item, index) => (
              <View key={item.route}>
                <Pressable
                  accessibilityHint={`Ouvrir ${item.title}`}
                  accessibilityRole="button"
                  onPress={() => {
                    void selectionHaptic();
                    router.push(item.route as Href);
                  }}
                  style={({ pressed }) => [styles.row, pressed && styles.pressed]}
                >
                  <AppSymbol
                    accessibilityLabel={item.title}
                    color={colors[colorScheme].accent}
                    name={item.icon}
                    size={21}
                  />
                  <View style={styles.rowText}>
                    <AppText variant="body">{item.title}</AppText>
                    <AppText colorRole="secondary" variant="caption">
                      {item.description}
                    </AppText>
                  </View>
                  <AppSymbol
                    color={colors[colorScheme].tertiary}
                    name="chevron.right"
                    size={13}
                  />
                </Pressable>
                {index < section.items.length - 1 ? (
                  <View
                    style={[
                      styles.separator,
                      { backgroundColor: colors[colorScheme].separator },
                    ]}
                  />
                ) : null}
              </View>
            ))}
          </View>
        </View>
      ))}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  intro: {
    marginBottom: spacing.xs,
  },
  section: {
    marginTop: spacing.lg,
  },
  sectionTitle: {
    marginLeft: spacing.md,
    marginBottom: spacing.xs,
    letterSpacing: 0.45,
  },
  group: {
    overflow: 'hidden',
    borderRadius: radii.medium,
  },
  row: {
    minHeight: 66,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  pressed: {
    opacity: 0.55,
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  separator: {
    height: StyleSheet.hairlineWidth,
    marginLeft: 52,
  },
});
