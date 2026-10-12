import './maintenance.css';

interface Status { enabled?: boolean; bypassed?: boolean }

export async function passMaintenanceGate(root: HTMLElement, baseUrl: string): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/maintenance-status`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`Status failed: ${response.status}`);
    const status = await response.json() as Status;
    if (!status.enabled || status.bypassed) return true;
    mount(root, false); return false;
  } catch { mount(root, true); return false; }
}

function mount(root: HTMLElement, failed: boolean): void {
  root.className = 'maintenance-root';
  const card = document.createElement('main'); card.className = 'maintenance-card';
  const heading = document.createElement('h1'); heading.textContent = failed ? 'Connection trouble' : 'Maintenance Mode';
  const copy = document.createElement('p'); copy.textContent = failed
    ? 'Could not check the server.'
    : "I'm testing new stuff. Super ABM will be back online in a few hours! – JP";
  card.append(heading, copy); root.replaceChildren(card);
}
