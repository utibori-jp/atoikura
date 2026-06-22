import { T } from "../../theme";

interface FormErrorProps {
  /** Error message; renders nothing when empty. */
  message: string;
}

/** Inline form error line. */
export function FormError({ message }: FormErrorProps) {
  if (!message) return null;
  return (
    <div role="alert" style={{ color: T.coralDeep, fontSize: 13, marginBottom: 10 }}>
      {message}
    </div>
  );
}
