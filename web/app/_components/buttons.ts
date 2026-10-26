import uiStyles from "./ui.module.css";

// The medium buttons that sit in cards and rows, as one class string each.
export const secondaryButton = `${uiStyles.button} ${uiStyles.md}`;
export const primaryButton = `${secondaryButton} ${uiStyles.primary}`;
export const dangerButton = `${secondaryButton} ${uiStyles.danger}`;
