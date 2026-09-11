/**
 * theme-colors.ts — Single source of truth for accent palette JS constants.
 *
 * These values match the --accent-* CSS variables in index.css.
 * They do NOT change between light and dark themes — only backgrounds,
 * borders, and text tokens change.
 *
 * Use these wherever CSS variables can't be read (e.g. Leaflet divIcon HTML
 * strings, inline canvas/SVG, etc.).
 */

export const ACCENT_GREEN  = '#22d3a5';
export const ACCENT_RED    = '#f04444';
export const ACCENT_AMBER  = '#f59e0b';
export const ACCENT_BLUE   = '#38bdf8';
export const ACCENT_SLATE  = '#64748b';

/** Near-black for text/icons drawn on top of a bright accent badge/circle */
export const ON_ACCENT = '#080b0f';
