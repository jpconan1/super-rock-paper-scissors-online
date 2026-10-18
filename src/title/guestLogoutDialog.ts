import type { AlertButtonSheets, AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';

const GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 220, y: 110, width: 520, height: 320 },
  portrait: { x: 25, y: 270, width: 490, height: 420 },
};

export const GUEST_LOGOUT_BUTTON_SHEETS: AlertButtonSheets = {
  up: '/account/delete-account-button-up-sheet.webp',
  between: '/account/delete-account-button-between-sheet.webp',
  depressed: '/account/delete-account-button-depressed-sheet.webp',
};

export function showGuestLogoutDialog(alerts: AlertSystem): Promise<boolean> {
  const warning = document.createElement('p');
  warning.className = 'guest-logout-dialog__warning';
  warning.textContent = "Logging out without claiming this account means you can't get it back.";
  return alerts.show<boolean>({
    ariaLabel: 'Guest account logout warning', title: 'Lose Guest Account?', geometry: GEOMETRY, content: warning,
    className: 'guest-logout-alert', dismissible: true, dismissValue: false,
    actions: [{ label: 'OK', value: true, sheets: GUEST_LOGOUT_BUTTON_SHEETS }],
  }).result.then((value) => value === true);
}
