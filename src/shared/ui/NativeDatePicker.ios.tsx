import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers';

type NativeDatePickerProps = { selection: Date; title: string; onChange: (date: Date) => void };

export function NativeDatePicker({ selection, title, onChange }: NativeDatePickerProps) {
  return (
    <Host style={{ width: '100%', height: 190 }}>
      <DatePicker title={title} selection={selection} displayedComponents={['date']} modifiers={[datePickerStyle('wheel')]} onDateChange={onChange} />
    </Host>
  );
}
