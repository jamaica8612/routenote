import { useEffect, useRef } from 'react';

const MARKET_CENTER = { lat: 35.2312, lng: 129.0835 };
const DEFAULT_OFFSETS = [
  { lat: 0.0004, lng: -0.0006 },
  { lat: 0.0004, lng: 0.0002 },
  { lat: -0.0002, lng: -0.0006 },
  { lat: -0.0002, lng: 0.0002 },
];

export default function MarketBuildingPins({ map, buildings, onPinClick, editable = false, onPositionChange }) {
  const markersRef = useRef([]);

  useEffect(() => {
    if (!map || !buildings?.length || !window.naver?.maps) return;

    markersRef.current.forEach(m => m.setMap(null));
    markersRef.current = [];

    buildings.forEach((building, idx) => {
      const lat = building.pos_lat ?? (MARKET_CENTER.lat + (DEFAULT_OFFSETS[idx % DEFAULT_OFFSETS.length]?.lat || 0));
      const lng = building.pos_lng ?? (MARKET_CENTER.lng + (DEFAULT_OFFSETS[idx % DEFAULT_OFFSETS.length]?.lng || 0));

      const icon = building.icon || '📍';
      const name = building.name || building.code;

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(lat, lng),
        map,
        draggable: !!editable,
        icon: {
          content: `
            <div style="
              display: flex;
              flex-direction: column;
              align-items: center;
              cursor: pointer;
              user-select: none;
              -webkit-user-select: none;
            ">
              <div style="
                background: #fff;
                border: 2px solid #e2e8f0;
                border-radius: 12px;
                padding: 6px 10px;
                display: flex;
                align-items: center;
                gap: 5px;
                box-shadow: 0 2px 8px rgba(0,0,0,0.15);
                white-space: nowrap;
                font-size: 13px;
                font-weight: 600;
                color: #1e293b;
                min-width: 64px;
                justify-content: center;
              ">
                <span style="font-size: 18px; line-height: 1;">${icon}</span>
                <span>${name}</span>
              </div>
              <div style="
                width: 0;
                height: 0;
                border-left: 6px solid transparent;
                border-right: 6px solid transparent;
                border-top: 7px solid #e2e8f0;
                margin-top: -1px;
              "></div>
            </div>
          `,
          anchor: new window.naver.maps.Point(40, 52),
        },
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        onPinClick?.(building.code);
      });

      if (editable) {
        window.naver.maps.Event.addListener(marker, 'dragend', () => {
          const pos = marker.getPosition();
          onPositionChange?.(building.code, pos.lat(), pos.lng());
        });
      }

      markersRef.current.push(marker);
    });

    return () => {
      markersRef.current.forEach(m => m.setMap(null));
      markersRef.current = [];
    };
  }, [map, buildings, editable, onPinClick, onPositionChange]);

  return null;
}
