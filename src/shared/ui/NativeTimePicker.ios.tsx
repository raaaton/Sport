import { DatePicker, Host } from '@expo/ui/swift-ui';
import { datePickerStyle } from '@expo/ui/swift-ui/modifiers';

type NativeTimePickerProps = {
  selection: Date;
  title: string;
  onChange: (date: Date) => void;
};

export function NativeTimePicker({ selection, title, onChange }: NativeTimePickerProps) {
  return (
    <Host style={{ width: '100%', height: 220 }}>
      <DatePicker
        title={title}
        selection={selection}
        displayedComponents={['hourAndMinute']}
        modifiers={[datePickerStyle('wheel')]}
        onDateChange={onChange}
      />
    </Host>
  );
}
