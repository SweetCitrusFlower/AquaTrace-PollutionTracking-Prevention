// Global type augmentations for Leaflet plugins.
// Some plugins ship loose or no .d.ts — these declarations let TypeScript
// accept the side-effect imports in MapView.tsx.

declare module 'leaflet.heat';
declare module 'leaflet-draw' {
  // The plugin itself attaches to L.Draw and L.Control.Draw at runtime.
  // Importing it for side-effect is enough; runtime reads the L namespace.
  const _default: unknown;
  export default _default;
}
