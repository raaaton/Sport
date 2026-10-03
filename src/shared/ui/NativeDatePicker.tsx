import { TextInput } from 'react-native';

type NativeDatePickerProps = { selection: Date; title: string; onChange: (date: Date) => void };

export function NativeDatePicker({ selection, title, onChange }: NativeDatePickerProps) {
  const value = `${selection.getFullYear()}-${String(selection.getMonth() + 1).padStart(2, '0')}-${String(selection.getDate()).padStart(2, '0')}`;
  return (
    <TextInput
      accessibilityLabel={title}
      keyboardType="numbers-and-punctuation"
      onChangeText={(text) => {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
        if (!match) return;
        const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
        if (!Number.isNaN(date.getTime()) && date.getFullYear() === Number(match[1]) && date.getMonth() + 1 === Number(match[2]) && date.getDate() === Number(match[3])) onChange(date);
      }}
      placeholder="AAAA-MM-JJ"
      value={value}
    />
  );
}
