import type { BoilClock } from '../animation/boilClock';
import { createBoilToggle } from '../input/boilToggle';
import { createStreamerModeToggle } from '../input/streamerMode';
import type { AlertSystem, ResponsiveAlertGeometry } from '../ui/alertSystem';
import { showNoCommunicationAlert } from '../ui/noCommunicationAlert';

const SETTINGS_GEOMETRY: ResponsiveAlertGeometry = {
  landscape: { x: 275, y: 150, width: 410, height: 240 },
  portrait: { x: 65, y: 330, width: 410, height: 300 },
};

export function showTitleSettingsAlert(alerts: AlertSystem, clock: BoilClock): void {
  const content = document.createElement('div');
  content.className = 'title-settings-alert__toggles';
  const boil = createBoilToggle(clock);
  const streamer = createStreamerModeToggle(clock, (enabled) => { if (enabled) showNoCommunicationAlert(alerts); });
  streamer.element.classList.add('title-settings-alert__streamer-toggle');
  content.append(boil.element, streamer.element);

  const handle = alerts.show({
    ariaLabel: 'Settings',
    geometry: SETTINGS_GEOMETRY,
    content,
    actions: [],
    className: 'title-settings-alert',
  });
  void handle.result.finally(() => {
    boil.destroy();
    streamer.destroy();
  });
}
