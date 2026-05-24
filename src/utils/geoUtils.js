import * as turf from '@turf/turf';

/**
 * Checks if a coordinate point [lat, lng] is inside a GeoJSON polygon or multipolygon.
 * Turf.js uses [lng, lat] coordinate format.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} polygonGeoJSON - GeoJSON polygon/multipolygon structure
 * @returns {boolean} - True if point is inside
 */
export function isPointInPolygon(lat, lng, polygonGeoJSON) {
  try {
    if (!polygonGeoJSON) return false;
    
    // Create Turf point [lng, lat]
    const point = turf.point([lng, lat]);
    
    let polyGeometry;
    if (polygonGeoJSON.type === 'Feature') {
      polyGeometry = polygonGeoJSON.geometry;
    } else if (polygonGeoJSON.type === 'Polygon' || polygonGeoJSON.type === 'MultiPolygon') {
      polyGeometry = polygonGeoJSON;
    } else if (Array.isArray(polygonGeoJSON)) {
      // Fallback fallback raw coordinates
      let coords = [];
      if (polygonGeoJSON.length > 0 && typeof polygonGeoJSON[0] === 'object' && 'lat' in polygonGeoJSON[0]) {
        coords = polygonGeoJSON.map(p => [p.lng, p.lat]);
      } else {
        coords = polygonGeoJSON;
      }
      
      if (coords.length > 0 && (coords[0][0] !== coords[coords.length - 1][0] || coords[0][1] !== coords[coords.length - 1][1])) {
        coords.push(coords[0]);
      }
      polyGeometry = turf.polygon([coords]).geometry;
    } else {
      return false;
    }

    return turf.booleanPointInPolygon(point, polyGeometry);
  } catch (error) {
    console.error('Error calculating point in polygon:', error);
    return false;
  }
}

/**
 * Calculates the center (centroid) of a Polygon or MultiPolygon.
 * Used for placing zone text labels on the map.
 * 
 * @param {object} polygonGeoJSON - GeoJSON geometry or feature
 * @returns {object|null} - {lat, lng} of centroid or null
 */
export function getPolygonCentroid(polygonGeoJSON) {
  try {
    if (!polygonGeoJSON) return null;
    
    let geom = polygonGeoJSON;
    if (polygonGeoJSON.type === 'Feature') {
      geom = polygonGeoJSON.geometry;
    }
    
    // Ensure it is a valid GeoJSON feature before passing to turf
    const feature = turf.feature(geom);
    const centerPoint = turf.centroid(feature);
    const [lng, lat] = centerPoint.geometry.coordinates;
    
    return { lat, lng };
  } catch (error) {
    console.error('Centroid calculation failed:', error);
    
    // Fallback: simple bounding box math if turf centroid fails
    try {
      let lats = [];
      let lngs = [];
      
      const extractCoords = (arr) => {
        if (typeof arr[0] === 'number') {
          lngs.push(arr[0]);
          lats.push(arr[1]);
        } else {
          arr.forEach(extractCoords);
        }
      };
      
      if (polygonGeoJSON.coordinates) {
        extractCoords(polygonGeoJSON.coordinates);
      } else if (Array.isArray(polygonGeoJSON)) {
        extractCoords(polygonGeoJSON);
      }
      
      if (lats.length === 0) return null;
      
      const minLat = Math.min(...lats);
      const maxLat = Math.max(...lats);
      const minLng = Math.min(...lngs);
      const maxLng = Math.max(...lngs);
      
      return {
        lat: (minLat + maxLat) / 2,
        lng: (minLng + maxLng) / 2
      };
    } catch (fallbackError) {
      console.error('Centroid fallback failed:', fallbackError);
      return null;
    }
  }
}

/**
 * Finds which zone contains the point.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zones - Array of route zones
 * @returns {object|null} - The zone object containing the point, or null
 */
export function findZoneForPoint(lat, lng, zones) {
  if (!zones || zones.length === 0) return null;
  
  for (const zone of zones) {
    if (zone.is_deleted) continue;
    if (isPointInPolygon(lat, lng, zone.polygon)) {
      return zone;
    }
  }
  return null;
}

/**
 * Finds the closest zone to a point and returns it if it is within maxDistanceMeters.
 * If the point is inside a zone, that zone is returned immediately with distance 0.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zones - Array of route zones
 * @param {number} maxDistanceMeters - Maximum distance threshold in meters (default: 150)
 * @returns {object|null} - { zone, distance } or null
 */
export function findNearbyZone(lat, lng, zones, maxDistanceMeters = 150) {
  if (!zones || zones.length === 0) return null;

  // 1. Check if point is inside any zone polygon
  const insideZone = findZoneForPoint(lat, lng, zones);
  if (insideZone) return { zone: insideZone, distance: 0 };

  // 2. Otherwise, find the closest zone based on centroid distance
  let closestZone = null;
  let minDistance = Infinity;

  const point = turf.point([lng, lat]);

  for (const zone of zones) {
    if (zone.is_deleted || !zone.polygon) continue;
    const centroid = getPolygonCentroid(zone.polygon);
    if (!centroid) continue;

    const centroidPoint = turf.point([centroid.lng, centroid.lat]);
    const dist = turf.distance(point, centroidPoint, { units: 'meters' });

    if (dist < minDistance) {
      minDistance = dist;
      closestZone = zone;
    }
  }

  if (closestZone && minDistance <= maxDistanceMeters) {
    return { zone: closestZone, distance: minDistance };
  }

  return null;
}

