import type { BoilClock } from '../animation/boilClock';
import { showCodeAlert, type CodeAlertActions } from '../auth/codeAlert';
import type { AlertSystem } from '../ui/alertSystem';

export type EmailLoginActions = CodeAlertActions;

export function showEmailLoginDialog(alerts: AlertSystem, clock: BoilClock, email: string,
  actions: EmailLoginActions): Promise<boolean> {
  return showCodeAlert(alerts, clock, email, actions);
}
