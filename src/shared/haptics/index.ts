import * as Haptics from 'expo-haptics';

export function selectionHaptic() {
  return Haptics.selectionAsync();
}

export function impactHaptic(style: Haptics.ImpactFeedbackStyle = Haptics.ImpactFeedbackStyle.Light) {
  return Haptics.impactAsync(style);
}

export function notificationHaptic(
  type: Haptics.NotificationFeedbackType = Haptics.NotificationFeedbackType.Success,
) {
  return Haptics.notificationAsync(type);
}
