import type { AlertButtonSheets, AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';

const CLAIM_ACCOUNT_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 260, y: 145, width: 440, height: 250 },
  portrait: { x: 45, y: 315, width: 450, height: 330 },
};

const SIGN_UP_SHEETS: AlertButtonSheets = {
  up: '/title/auth/sign-up-button-up-sheet.webp',
  between: '/title/auth/sign-up-button-between-sheet.webp',
  depressed: '/title/auth/sign-up-button-depressed-sheet.webp',
};

const GOOGLE_SHEETS: AlertButtonSheets = {
  up: '/title/google-sign-in/google-sign-in-button-up-sheet.webp',
  between: '/title/google-sign-in/google-sign-in-button-between-sheet.webp',
  depressed: '/title/google-sign-in/google-sign-in-button-depressed-sheet.webp',
};

export type ClaimAccountMethod = 'email' | 'google';

export function showClaimAccountDialog(alerts: AlertSystem): Promise<ClaimAccountMethod | undefined> {
  const heading = document.createElement('h2');
  heading.className = 'claim-account-dialog__heading';
  heading.textContent = 'Choose Sign In Method';
  return alerts.show<ClaimAccountMethod>({
    ariaLabel: 'Choose Sign In Method',
    geometry: CLAIM_ACCOUNT_GEOMETRY,
    content: heading,
    className: 'claim-account-alert',
    dismissible: true,
    actions: [
      { label: 'Sign Up', value: 'email', sheets: SIGN_UP_SHEETS },
      { label: 'Sign In with Google', value: 'google', sheets: GOOGLE_SHEETS },
    ],
  }).result;
}
