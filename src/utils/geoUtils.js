import * as turf from '@turf/turf';

/**
 * Checks if a coordinate point [lat, lng] is inside a GeoJSON polygon structure.
 * Turf.js uses [lng, lat] coordinate format.
 * 
 * @param {number} lat - Latitude
 * @param {number} lng - Longitude
 * @param {object} polygonGeoJSON - GeoJSON polygon coordinates or feature
 * @returns {boolean} - True if point is inside polygon
 */
export function isPointInPolygon(lat, lng, polygonGeoJSON) {
  try {
    if (!polygonGeoJSON) return false;
    
    // Create Turf point [lng, lat]
    const point = turf.point([lng, lat]);
    
    // Ensure we have a valid Polygon geometry
    let polyGeometry;
    if (polygonGeoJSON.type === 'Feature') {
      polyGeometry = polygonGeoJSON.geometry;
    } else if (polygonGeoJSON.type === 'Polygon') {
      polyGeometry = polygonGeoJSON;
    } else if (Array.isArray(polygonGeoJSON)) {
      // If it's a raw array of [lng, lat] or [{lat, lng}]
      let coords = [];
      if (polygonGeoJSON.length > 0 && typeof polygonGeoJSON[0] === 'object' && 'lat' in polygonGeoJSON[0]) {
        coords = polygonGeoJSON.map(p => [p.lng, p.lat]);
      } else {
        coords = polygonGeoJSON;
      }
      
      // Close the polygon loop if it's not closed
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
 * Finds which zone containing the point from a list of zones.
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
    // Supposing zone.polygon stores the GeoJSON or coordinate array
    if (isPointInPolygon(lat, lng, zone.polygon)) {
      return zone;
    }
  }
  return null;
}
