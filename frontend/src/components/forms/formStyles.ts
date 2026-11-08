import type React from "react";
import { T } from "../../theme";

/**
 * Shared form-control styling extracted from the per-screen `input_style`
 * duplicated across `WebRecurring` / `WebIncome` / `WebMaster` and their mobile
 * twins (#138). The field primitives in this folder consume these so every form
 * input/select looks identical.
 */
export const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: `1.5px solid ${T.hair}`,
  borderRadius: 12,
  fontFamily: "inherit",
  fontSize: 14,
  color: T.ink,
  background: T.bgSoft,
  outline: "none",
  boxSizing: "border-box",
};

/** Small caption shown above a field. */
export const labelStyle: React.CSSProperties = {
  fontSize: 11,
  color: T.inkSoft,
  marginBottom: 4,
};
