# INK NEXT V21 — Responsive / pre-deployment build

Based on V20. The GLB and configurator logic are unchanged. V21 replaces fixed-offset mobile and tablet controls with a normal document-flow layout. On screens under 950px the 3D stage comes first, then camera presets, safe loading, and the configuration panel. The vehicle features and Render Quality expand inside the configuration panel instead of obscuring the car.

## Windows

```powershell
npm.cmd install
npm.cmd run dev
```

Then open http://localhost:3000. Verify installation by running `npm.cmd run build`.

## Before publishing

- Test responsive views at 390px, 768px and desktop widths.
- On phones, ensure the panels scroll naturally and all swatches / camera buttons are reachable.
- Keep Low mode; the original GLB is large and could stress a device.
- This layout revision does not fix any existing system-wide display crash. Do not stress-test the model on a laptop with repeated black-screen failures.
