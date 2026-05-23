import proj4 from 'proj4';
import { supabase } from '../supabaseClient';

const EPSG_5179 =
  '+proj=tmerc +lat_0=38 +lon_0=127.5 +k=0.9996 +x_0=1000000 +y_0=2000000 +ellps=GRS80 +units=m +no_defs';

proj4.defs('EPSG:5179', EPSG_5179);

function transformCoordinate(coord) {
  const [lng, lat] = proj4('EPSG:5179', 'EPSG:4326', coord);
  return [lng, lat];
}

function transformRing(ring) {
  return ring.map(transformCoordinate);
}

function transformGeometry(geometry) {
  if (!geometry || !geometry.type || !geometry.coordinates) {
    throw new Error('Invalid postcode geometry.');
  }

  if (geometry.type === 'Polygon') {
    return {
      type: 'Polygon',
      coordinates: geometry.coordinates.map(transformRing),
    };
  }

  if (geometry.type === 'MultiPolygon') {
    return {
      type: 'MultiPolygon',
      coordinates: geometry.coordinates.map((polygon) => polygon.map(transformRing)),
    };
  }

  throw new Error(`Unsupported geometry type: ${geometry.type}`);
}

function normalizeZonePayload(raw) {
  if (!raw) {
    throw new Error('No postcode zone data returned.');
  }

  if (raw.error) {
    throw new Error(raw.error);
  }

  return {
    postcode: String(raw.postcode || raw.sbdno || ''),
    cityName: raw.cityName || raw.ctpvNm || '',
    districtName: raw.districtName || raw.sigNm || '',
    neighborhoodCode: raw.neighborhoodCode || raw.lgvReplcCd || '',
    source: raw.source || 'unknown',
    geometry: raw.geometry,
  };
}

async function fetchViaSupabase(postcode) {
  try {
    const { data, error } = await supabase.functions.invoke('rn-postcode-zone', {
      method: 'GET',
      queryParams: { postcode },
    });

    if (error) {
      throw error;
    }

    return normalizeZonePayload(data);
  } catch (err) {
    if (err.message && err.message.includes('non-2xx')) {
      throw new Error('우편번호 조회 기능(Edge Function: rn-postcode-zone)이 배포되지 않았거나 호출할 수 없습니다. 배포 가이드를 참조하여 배포해주시기 바랍니다.');
    }
    throw err;
  }
}

async function fetchViaViteProxy(postcode) {
  const response = await fetch('/juso-api/api/totalMap/selectKarbSbdList', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      districtNo: postcode,
      pageable: {
        page: 0,
        size: 1,
        sort: [],
      },
    }),
  });

  if (!response.ok) {
    throw new Error(`Postcode lookup failed with ${response.status}.`);
  }

  const payload = await response.json();
  const item = payload?.results?.content?.[0];

  if (!item?.geom) {
    throw new Error('No postcode boundary found.');
  }

  const geometry5179 = JSON.parse(item.geom);
  const geometry = transformGeometry(geometry5179);

  return normalizeZonePayload({
    postcode: item.sbdno,
    cityName: item.ctpvNm,
    districtName: item.sigNm,
    neighborhoodCode: item.lgvReplcCd,
    source: 'vite-proxy',
    geometry,
  });
}

export async function fetchPostcodeZone(postcode) {
  const normalizedPostcode = String(postcode || '').trim();

  if (!/^\d{5}$/.test(normalizedPostcode)) {
    throw new Error('Enter a 5-digit postcode.');
  }

  if (import.meta.env.DEV) {
    return fetchViaViteProxy(normalizedPostcode);
  }

  try {
    return await fetchViaSupabase(normalizedPostcode);
  } catch (error) {
    throw new Error(error?.message || 'Postcode lookup failed.');
  }
}
