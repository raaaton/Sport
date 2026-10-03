export const colors = {
  light: {
    background: '#F2F2F7',
    groupedBackground: '#FFFFFF',
    primary: '#111114',
    secondary: '#6C6C70',
    tertiary: '#8E8E93',
    separator: 'rgba(60, 60, 67, 0.18)',
    accent: '#007AFF',
    destructive: '#FF3B30',
  },
  dark: {
    background: '#000000',
    groupedBackground: '#1C1C1E',
    primary: '#F5F5F7',
    secondary: '#AEAEB2',
    tertiary: '#8E8E93',
    separator: 'rgba(84, 84, 88, 0.65)',
    accent: '#0A84FF',
    destructive: '#FF453A',
  },
} as const;

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
} as const;

export const radii = {
  small: 8,
  medium: 12,
  large: 16,
  continuous: 24,
  pill: 999,
} as const;

export const typography = {
  largeTitle: { fontSize: 34, fontWeight: '700' as const, letterSpacing: 0.35 },
  title: { fontSize: 22, fontWeight: '700' as const, letterSpacing: 0.35 },
  headline: { fontSize: 17, fontWeight: '600' as const, letterSpacing: -0.4 },
  body: { fontSize: 17, fontWeight: '400' as const, letterSpacing: -0.4 },
  callout: { fontSize: 16, fontWeight: '400' as const, letterSpacing: -0.3 },
  subheadline: { fontSize: 15, fontWeight: '400' as const, letterSpacing: -0.2 },
  footnote: { fontSize: 13, fontWeight: '400' as const, letterSpacing: -0.1 },
  caption: { fontSize: 12, fontWeight: '400' as const, letterSpacing: 0 },
} as const;
