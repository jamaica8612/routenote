const radiusFromArea = (areaSqm) => Math.round(Math.sqrt(areaSqm / Math.PI) * 10) / 10;

const NAMGU_VACANT_AREAS = [
  { id: 'namgu-1', name: '문현2동 1구역', address: '부산광역시 남구 문현동 603-6 일대', lat: 35.1472210, lng: 129.0683685, areaSqm: 7763.2, grade1: 4, grade2: 8, grade3: 2, total: 14 },
  { id: 'namgu-2', name: '문현2동 2구역', address: '부산광역시 남구 문현동 486-31 일대', lat: 35.1434977, lng: 129.0677552, areaSqm: 9095.1, grade1: 14, grade2: 8, grade3: 0, total: 22 },
  { id: 'namgu-3', name: '우암동 1구역', address: '부산광역시 남구 우암동 189-1604 일대', lat: 35.1268893, lng: 129.0683018, areaSqm: 7394.6, grade1: 24, grade2: 14, grade3: 0, total: 38 },
  { id: 'namgu-4', name: '우암동 2구역', address: '부산광역시 남구 우암동 189-895 일대', lat: 35.1271096, lng: 129.0696105, areaSqm: 7217.3, grade1: 7, grade2: 6, grade3: 0, total: 13 },
  { id: 'namgu-5', name: '우암동 3구역', address: '부산광역시 남구 우암동 189-560 일대', lat: 35.1267586, lng: 129.0706698, areaSqm: 7177.0, grade1: 13, grade2: 10, grade3: 2, total: 25 },
  { id: 'namgu-6', name: '우암동 4구역', address: '부산광역시 남구 우암동 189-1119 일대', lat: 35.1257127, lng: 129.0695564, areaSqm: 9802.1, grade1: 14, grade2: 10, grade3: 2, total: 26 },
  { id: 'namgu-7', name: '우암동 5구역', address: '부산광역시 남구 우암동 189-764 일대', lat: 35.1259549, lng: 129.0705268, areaSqm: 6789.2, grade1: 4, grade2: 9, grade3: 0, total: 13 },
  { id: 'namgu-8', name: '우암동 6구역', address: '부산광역시 남구 우암동 176-43 일대', lat: 35.1253339, lng: 129.0732947, areaSqm: 8981.5, grade1: 12, grade2: 7, grade3: 0, total: 19 },
  { id: 'namgu-9', name: '감만2동 1구역', address: '부산광역시 남구 감만동 12-10 일대', lat: 35.1219783, lng: 129.0830399, areaSqm: 9568.6, grade1: 0, grade2: 9, grade3: 1, total: 10 },
].map((area) => ({ ...area, radiusMeters: radiusFromArea(area.areaSqm) }));

export const TEMPORARY_OVERLAY_PRESETS = {
  d66db11a84ce: {
    id: 'busan-namgu-2025-164',
    title: '남구 빈집밀집구역 9곳',
    source: '부산광역시 남구 고시 제2025-164호',
    disclaimer: '기준 번지와 공시 면적을 원형으로 환산한 예상 범위입니다. 법정 경계가 아닙니다.',
    areas: NAMGU_VACANT_AREAS,
  },
};
