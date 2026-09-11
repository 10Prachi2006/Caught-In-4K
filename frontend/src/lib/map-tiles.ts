/**
 * map-tiles.ts — Single source of truth for Leaflet tile URLs.
 *
 * Uses Stadia Maps free raster tiles (no API key required for localhost /
 * demo usage up to 200k requests/day). They provide authentic dark and
 * light basemaps with roads, labels, and coastlines.
 *
 * Stadia Maps tile docs: https://docs.stadiamaps.com/maps/raster-tiles/
 *
 * If you ever need to switch providers, change only this file.
 */

export const TILE_DARK =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth_dark/{z}/{x}/{y}{r}.png';

export const TILE_LIGHT =
  'https://tiles.stadiamaps.com/tiles/alidade_smooth/{z}/{x}/{y}{r}.png';

export const TILE_ATTRIBUTION =
  '&copy; <a href="https://stadiamaps.com/" target="_blank">Stadia Maps</a> &copy; <a href="https://openmaptiles.org/" target="_blank">OpenMapTiles</a> &copy; <a href="https://www.openstreetmap.org/copyright" target="_blank">OpenStreetMap</a>';

/**
 * Returns the correct tile URL for the given theme.
 * Pass the `theme` value from `useTheme()`.
 */
export function getTileUrl(theme: 'light' | 'dark'): string {
  return theme === 'light' ? TILE_LIGHT : TILE_DARK;
}
