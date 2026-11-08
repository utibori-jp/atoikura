import { FormField } from "./FormField";

interface AmountFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  min?: number;
}

/** A numeric amount input (yen). Thin specialization of {@link FormField}. */
export function AmountField({ label, value, onChange, placeholder, min = 0 }: AmountFieldProps) {
  return (
    <FormField
      label={label}
      type="number"
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      min={min}
    />
  );
}
