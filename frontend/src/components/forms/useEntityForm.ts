import { useCallback, useState } from "react";

interface UseEntityFormConfig<TForm, TEntity> {
  /** Produces the empty form used when creating a new entity. */
  blank: () => TForm;
  /** Maps an existing entity to its editable form state. */
  fromEntity: (entity: TEntity) => TForm;
  /** Persists the form. Throw an `Error` to surface its message and keep the form open. */
  onSubmit: (form: TForm) => Promise<void>;
  /** Optional synchronous validation; return an error message to block submission, or null. */
  validate?: (form: TForm) => string | null;
}

export interface UseEntityForm<TForm, TEntity> {
  /** Current form, or null when no form is open. */
  form: TForm | null;
  /** True while `onSubmit` is in flight. */
  submitting: boolean;
  /** Current error message ("" when none). */
  error: string;
  /** True when the open form is editing an existing entity. */
  isEdit: boolean;
  /** Open a blank form in create mode. */
  openCreate: () => void;
  /** Open a form populated from `entity` in edit mode. */
  openEdit: (entity: TEntity) => void;
  /** Close the form (no submission). */
  close: () => void;
  /** Update a single field of the open form. */
  setField: <K extends keyof TForm>(key: K, value: TForm[K]) => void;
  /** Merge a partial patch into the open form. */
  update: (patch: Partial<TForm>) => void;
  /** Set the error message directly. */
  setError: (message: string) => void;
  /** Validate then submit the current form. */
  submit: () => Promise<void>;
}

/**
 * Generic create/edit form controller shared by the entity screens (#138). It
 * owns the `form | null` state, create/edit modes, field updates, and the
 * submit lifecycle (validation → loading → error/close), removing the
 * copy-pasted `*_form` state and `open_create_form` / `open_edit_form` /
 * `handle_submit` handlers from each screen.
 */
export function useEntityForm<TForm, TEntity>({
  blank,
  fromEntity,
  onSubmit,
  validate,
}: UseEntityFormConfig<TForm, TEntity>): UseEntityForm<TForm, TEntity> {
  const [form, setForm] = useState<TForm | null>(null);
  const [isEdit, setIsEdit] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const openCreate = useCallback(() => {
    setForm(blank());
    setIsEdit(false);
    setError("");
  }, [blank]);

  const openEdit = useCallback(
    (entity: TEntity) => {
      setForm(fromEntity(entity));
      setIsEdit(true);
      setError("");
    },
    [fromEntity]
  );

  const close = useCallback(() => {
    setForm(null);
    setError("");
  }, []);

  const setField = useCallback(<K extends keyof TForm>(key: K, value: TForm[K]) => {
    setForm((prev) => (prev ? { ...prev, [key]: value } : prev));
  }, []);

  const update = useCallback((patch: Partial<TForm>) => {
    setForm((prev) => (prev ? { ...prev, ...patch } : prev));
  }, []);

  const submit = useCallback(async () => {
    if (!form) return;
    if (validate) {
      const validation_error = validate(form);
      if (validation_error) {
        setError(validation_error);
        return;
      }
    }
    setError("");
    setSubmitting(true);
    try {
      await onSubmit(form);
      setForm(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "エラーが発生しました");
    } finally {
      setSubmitting(false);
    }
  }, [form, validate, onSubmit]);

  return {
    form,
    submitting,
    error,
    isEdit,
    openCreate,
    openEdit,
    close,
    setField,
    update,
    setError,
    submit,
  };
}
