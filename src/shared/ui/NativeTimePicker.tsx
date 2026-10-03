import { useState } from 'react';
import { StyleSheet, TextInput } from 'react-native';

type NativeTimePickerProps = {
  selection: Date;
  title: string;
  onChange: (date: Date) => void;
};

function formatTime(date: Date): string {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

export function NativeTimePicker({ selection, title, onChange }: NativeTimePickerProps) {
  const [value, setValue] = useState(formatTime(selection));

  const update = (nextValue: string) => {
    setValue(nextValue);
    const match = /^(\d{1,2}):(\d{2})$/.exec(nextValue);
    if (!match) return;
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    if (hour > 23 || minute > 59) return;
    const next = new Date(selection);
    next.setHours(hour, minute, 0, 0);
    onChange(next);
  };

  return (
    <TextInput
      accessibilityLabel={title}
      keyboardType="numbers-and-punctuation"
      onChangeText={update}
      placeholder="HH:mm"
      style={styles.input}
      value={value}
    />
  );
}

const styles = StyleSheet.create({ input: { minHeight: 48, textAlign: 'center', fontSize: 22, fontVariant: ['tabular-nums'] } });
