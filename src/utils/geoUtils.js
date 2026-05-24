/**
 * Haversine formula to compute distance between two GPS coordinates in meters.
 * 
 * @param {number} lat1 - Latitude of first point
 * @param {number} lon1 - Longitude of first point
 * @param {number} lat2 - Latitude of second point
 * @param {number} lon2 - Longitude of second point
 * @returns {number} - Distance in meters
 */
export function getHaversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371000; // Earth radius in meters
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = 
    Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  return R * c;
}

function isPointInSinglePolygon(lat, lng, ringCoords) {
  let inside = false;
  const n = ringCoords.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const xi = ringCoords[i][0], yi = ringCoords[i][1];
    const xj = ringCoords[j][0], yj = ringCoords[j][1];

    const intersect = ((yi > lat) !== (yj > lat))
        && (lng < (xj - xi) * (lat - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
}

function isPointInPolygonGeometry(lat, lng, coords) {
  if (!coords || coords.length === 0) return false;
  
  if (!isPointInSinglePolygon(lat, lng, coords[0])) {
    return false;
  }
  
  for (let i = 1; i < coords.length; i++) {
    if (isPointInSinglePolygon(lat, lng, coords[i])) {
      return false; // inside a hole
    }
  }
  return true;
}

function isPointInMultiPolygonGeometry(lat, lng, coords) {
  for (const polygonCoords of coords) {
    if (isPointInPolygonGeometry(lat, lng, polygonCoords)) {
      return true;
    }
  }
  return false;
}

/**
 * Checks if a coordinate point [lat, lng] is inside a GeoJSON polygon or multipolygon.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} polygonGeoJSON - GeoJSON polygon/multipolygon structure
 * @returns {boolean} - True if point is inside
 */
export function isPointInPolygon(lat, lng, polygonGeoJSON) {
  try {
    if (!polygonGeoJSON) return false;
    
    let geom = polygonGeoJSON;
    if (polygonGeoJSON.type === 'Feature') {
      geom = polygonGeoJSON.geometry;
    }
    
    if (geom.type === 'Polygon') {
      return isPointInPolygonGeometry(lat, lng, geom.coordinates);
    } else if (geom.type === 'MultiPolygon') {
      return isPointInMultiPolygonGeometry(lat, lng, geom.coordinates);
    }
    
    return false;
  } catch (error) {
    console.error('Error in isPointInPolygon:', error);
    return false;
  }
}

/**
 * Calculates the center (centroid) of a Polygon or MultiPolygon by averaging coordinates.
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
    
    let sumLat = 0;
    let sumLng = 0;
    let count = 0;
    
    const processCoords = (coords) => {
      if (Array.isArray(coords) && typeof coords[0] === 'number') {
        sumLng += coords[0];
        sumLat += coords[1];
        count++;
      } else if (Array.isArray(coords)) {
        coords.forEach(processCoords);
      }
    };
    
    if (geom.coordinates) {
      processCoords(geom.coordinates);
    }
    
    if (count === 0) return null;
    return {
      lat: sumLat / count,
      lng: sumLng / count
    };
  } catch (error) {
    console.error('Centroid calculation failed:', error);
    return null;
  }
}

/**
 * Finds which zone contains the point.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {Array} zones - Array of route zones
 * @returns {object|null} - The zone containing the point, or null
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

  for (const zone of zones) {
    if (zone.is_deleted || !zone.polygon) continue;
    const ctr = getPolygonCentroid(zone.polygon);
    if (!ctr) continue;

    const dist = getHaversineDistance(lat, lng, ctr.lat, ctr.lng);

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
