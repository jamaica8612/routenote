import { TEMPORARY_OVERLAY_PRESETS } from '../data/temporaryOverlayPresets';

const SESSION_KEY = 'rn_temporary_map_overlay';
const HASH_PREFIX = '#private-map=';

function isValidOverlay(overlay) {
  return Boolean(
    overlay
    && typeof overlay.id === 'string'
    && typeof overlay.title === 'string'
    && Array.isArray(overlay.areas)
    && overlay.areas.length > 0
    && overlay.areas.length <= 50
    && overlay.areas.every((area) => (
      typeof area.id === 'string'
      && typeof area.name === 'string'
      && typeof area.address === 'string'
      && Number.isFinite(area.lat)
      && area.lat >= -90
      && area.lat <= 90
      && Number.isFinite(area.lng)
      && area.lng >= -180
      && area.lng <= 180
      && Number.isFinite(area.radiusMeters)
      && area.radiusMeters >= 10
      && area.radiusMeters <= 1000
    ))
  );
}

export function loadTemporaryOverlay() {
  try {
    const hash = window.location.hash;
    if (hash.startsWith(HASH_PREFIX)) {
      const token = decodeURIComponent(hash.slice(HASH_PREFIX.length));
      const preset = TEMPORARY_OVERLAY_PRESETS[token];

      window.history.replaceState(null, document.title, `${window.location.pathname}${window.location.search}`);

      if (isValidOverlay(preset)) {
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(preset));
        return preset;
      }
    }

    const saved = sessionStorage.getItem(SESSION_KEY);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (isValidOverlay(parsed)) return parsed;
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn('Failed to load the temporary map overlay:', error);
  }

  return null;
}

export function clearTemporaryOverlay() {
  try {
    sessionStorage.removeItem(SESSION_KEY);
  } catch (error) {
    console.warn('Failed to clear the temporary map overlay:', error);
  }
}
