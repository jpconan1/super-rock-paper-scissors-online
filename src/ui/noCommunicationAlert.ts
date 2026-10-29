import type { AlertSystem } from './alertSystem';

export function showNoCommunicationAlert(alerts: AlertSystem): void {
  alerts.show({
    ariaLabel: 'No Communication Mode',
    title: 'No Communication Mode',
    content: 'Turning this on hides community features like the shared drawing/chatting whiteboard and custom emblems.',
    geometry: {
      landscape: { x: 210, y: 125, width: 540, height: 300 },
      portrait: { x: 50, y: 265, width: 440, height: 350 },
    },
    className: 'no-communication-alert',
    actions: [{
      label: 'Continue', value: true,
      sheets: {
        up: '/new-buttons/continue-button-w-up-sheet.webp',
        between: '/new-buttons/continue-button-w-between-sheet.webp',
        depressed: '/new-buttons/continue-button-w-depressed-sheet.webp',
      },
    }],
  });
}
