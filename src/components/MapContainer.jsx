import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { isPointInPolygon } from '../utils/geoUtils';
import { Navigation, Plus, Check, X, ShieldAlert, Map as MapIcon, ArrowRightLeft } from 'lucide-react';

const MARKER_TYPES = {
  vehicle_entrance: { emoji: '🚗', label: '차량 진입구' },
  parking: { emoji: '🅿️', label: '정차/주차' },
  entrance: { emoji: '🚪', label: '출입구/공동현관' },
  elevator: { emoji: '🛗', label: '엘리베이터' },
  delivery_spot: { emoji: '📦', label: '배송 위치' },
  warning: { emoji: '⚠️', label: '주의' },
  access_code: { emoji: '🔑', label: '비번/호출' },
  important: { emoji: '⭐', label: '중요' },
};

export default function MapContainer({
  zones,
  tips,
  paths,
  selectedResult,
  currentUser,
  onMapClick,
  onMarkerClick,
  onZoneClick,
  isDrawingZone,
  setIsDrawingZone,
  isDrawingPath,
  setIsDrawingPath,
  activePathId,
  setActivePathId,
  drawCoords,
  setDrawCoords,
  onFinishDrawingZone,
  onFinishDrawingPath,
}) {
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [markers, setMarkers] = useState([]);
  const [polygons, setPolygons] = useState([]);
  const [pathLines, setPathLines] = useState([]);
  const [drawingPolyline, setDrawingPolyline] = useState(null);
  const [drawingMarkers, setDrawingMarkers] = useState([]);

  // Initialize Naver Map
  useEffect(() => {
    if (!window.naver || !window.naver.maps) {
      console.error('Naver Maps script is not loaded yet.');
      return;
    }

    // Default center (Seoul, or Busan, or custom)
    const defaultCenter = new window.naver.maps.LatLng(35.2312, 129.0835); // Example: Pusan National Univ Area
    const mapOptions = {
      center: defaultCenter,
      zoom: 16,
      minZoom: 10,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.RIGHT_CENTER,
      },
      mapTypeControl: true,
      logoControl: false,
    };

    const map = new window.naver.maps.Map(mapRef.current, mapOptions);
    setMapInstance(map);

    // Map Click / Long Press Handling
    window.naver.maps.Event.addListener(map, 'click', (e) => {
      // In normal mode, single click can be used to add marker or clear selections
      if (!isDrawingZone && !isDrawingPath) {
        // Trigger parent callback to open New Tip modal
        onMapClick(e.coord.lat(), e.coord.lng());
      } else {
        // Drawing Mode: Add Point
        const lat = e.coord.lat();
        const lng = e.coord.lng();
        setDrawCoords(prev => [...prev, { lat, lng }]);
      }
    });

    // Handle Map Longpress to create marker
    window.naver.maps.Event.addListener(map, 'longpress', (e) => {
      if (!isDrawingZone && !isDrawingPath) {
        onMapClick(e.coord.lat(), e.coord.lng());
      }
    });

    return () => {
      window.naver.maps.Event.clearInstanceListeners(map);
    };
  }, [isDrawingZone, isDrawingPath]);

  // Handle zooming/panning to search result
  useEffect(() => {
    if (!mapInstance || !selectedResult) return;

    if (selectedResult.type === 'address') {
      const { lat, lng } = selectedResult.data;
      const targetLatLng = new window.naver.maps.LatLng(lat, lng);
      mapInstance.setCenter(targetLatLng);
      mapInstance.setZoom(18);
    } else if (selectedResult.type === 'tip') {
      const { lat, lng } = selectedResult.data;
      const targetLatLng = new window.naver.maps.LatLng(lat, lng);
      mapInstance.setCenter(targetLatLng);
      mapInstance.setZoom(19);
      // Trigger tip marker details
      onMarkerClick(selectedResult.data);
    } else if (selectedResult.type === 'zone') {
      // Center on zone centroid
      const zone = selectedResult.data;
      if (zone.polygon && zone.polygon.coordinates) {
        const coords = zone.polygon.coordinates[0];
        // simple average centroid
        let latSum = 0, lngSum = 0;
        coords.forEach(c => {
          lngSum += c[0];
          latSum += c[1];
        });
        const centerLatLng = new window.naver.maps.LatLng(latSum / coords.length, lngSum / coords.length);
        mapInstance.setCenter(centerLatLng);
        mapInstance.setZoom(17);
        onZoneClick(zone);
      }
    }
  }, [selectedResult, mapInstance]);

  // Render Saved Zones (Polygons)
  useEffect(() => {
    if (!mapInstance || !zones) return;

    // Clear existing polygons
    polygons.forEach(p => p.setMap(null));
    const newPolygons = [];

    zones.forEach(zone => {
      if (zone.is_deleted || !zone.polygon || !zone.polygon.coordinates) return;

      const naverCoords = zone.polygon.coordinates[0].map(
        c => new window.naver.maps.LatLng(c[1], c[0])
      );

      const polygon = new window.naver.maps.Polygon({
        map: mapInstance,
        paths: [naverCoords],
        fillColor: zone.color || '#6366F1',
        fillOpacity: 0.15,
        strokeColor: zone.color || '#6366F1',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        clickable: true,
      });

      // Show zone detail on click
      window.naver.maps.Event.addListener(polygon, 'click', () => {
        onZoneClick(zone);
      });

      newPolygons.push(polygon);
    });

    setPolygons(newPolygons);
  }, [zones, mapInstance]);

  // Render Route Tips (Markers with age calculation)
  useEffect(() => {
    if (!mapInstance || !tips) return;

    // Clear old markers
    markers.forEach(m => m.setMap(null));
    const newMarkers = [];

    tips.forEach(tip => {
      if (tip.is_deleted) return;

      // Age calculation for styling
      let statusClass = 'marker-active'; // Less than 90 days
      let opacity = 1.0;
      let borderStyle = '2px solid #FFFFFF';
      let background = '#6366F1';

      if (tip.last_verified_at) {
        const lastVerified = new Date(tip.last_verified_at);
        const now = new Date();
        const diffTime = Math.abs(now - lastVerified);
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

        if (diffDays >= 90 && diffDays < 180) {
          statusClass = 'marker-warn';
          opacity = 0.65;
          background = '#9CA3AF'; // Faded gray-blue
        } else if (diffDays >= 180) {
          statusClass = 'marker-old';
          opacity = 0.45;
          background = '#4B5563'; // Faded dark gray
          borderStyle = '1.5px dashed #9CA3AF';
        }
      } else {
        // No verification date = very old
        statusClass = 'marker-old';
        opacity = 0.45;
        background = '#4B5563';
        borderStyle = '1.5px dashed #9CA3AF';
      }

      const markerTypeObj = MARKER_TYPES[tip.marker_type] || { emoji: '📦' };

      // High-performance HTML Marker representation
      const markerContent = `
        <div class="custom-map-marker ${statusClass}" style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 36px;
          height: 36px;
          background-color: ${background};
          border: ${borderStyle};
          border-radius: 50%;
          box-shadow: 0 4px 10px rgba(0,0,0,0.3);
          font-size: 20px;
          opacity: ${opacity};
          transition: all 0.2s;
        ">
          ${markerTypeObj.emoji}
        </div>
      `;

      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(tip.lat, tip.lng),
        map: mapInstance,
        title: tip.title,
        icon: {
          content: markerContent,
          anchor: new window.naver.maps.Point(18, 18),
        },
      });

      window.naver.maps.Event.addListener(marker, 'click', () => {
        onMarkerClick(tip);
      });

      newMarkers.push(marker);
    });

    setMarkers(newMarkers);
  }, [tips, mapInstance]);

  // Render Active Route Path (Numbered Points + Line with Arrows)
  useEffect(() => {
    if (!mapInstance) return;

    // Clear old path drawings
    pathLines.forEach(pl => pl.setMap(null));
    const newPathLines = [];

    if (!activePathId) {
      setPathLines([]);
      return;
    }

    // Fetch path details & points for activePathId
    const drawSavedPath = async () => {
      try {
        const { data: points, error } = await supabase
          .from('rn_route_path_points') // [Prefix Update] route_path_points -> rn_route_path_points
          .select('*')
          .eq('path_id', activePathId)
          .order('order_index', { ascending: true });

        if (error) throw error;
        if (!points || points.length === 0) return;

        const polylineCoords = points.map(pt => new window.naver.maps.LatLng(pt.lat, pt.lng));

        // Draw Polyline
        const pathLine = new window.naver.maps.Polyline({
          map: mapInstance,
          path: polylineCoords,
          strokeColor: '#EF4444', // Red path line
          strokeOpacity: 0.8,
          strokeWeight: 4,
          strokeStyle: 'solid',
          startCap: 'round',
          endCap: 'round',
        });
        newPathLines.push(pathLine);

        // Draw numbered markers for points
        points.forEach((pt, index) => {
          const pointContent = `
            <div style="
              display: flex;
              align-items: center;
              justify-content: center;
              width: 24px;
              height: 24px;
              background-color: #EF4444;
              color: #FFFFFF;
              border: 2px solid #FFFFFF;
              border-radius: 50%;
              font-size: 12px;
              font-weight: 700;
              box-shadow: 0 2px 6px rgba(0,0,0,0.4);
            ">
              ${index + 1}
            </div>
          `;

          const pointMarker = new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(pt.lat, pt.lng),
            map: mapInstance,
            title: pt.title,
            icon: {
              content: pointContent,
              anchor: new window.naver.maps.Point(12, 12),
            },
          });
          newPathLines.push(pointMarker);
        });

        setPathLines(newPathLines);
      } catch (err) {
        console.error('Error drawing active path:', err);
      }
    };

    drawSavedPath();
  }, [activePathId, mapInstance]);

  // Handle Drawing Modes UI (Visual updates of unsaved lines/points)
  useEffect(() => {
    if (!mapInstance) return;

    // Remove old drawings
    if (drawingPolyline) drawingPolyline.setMap(null);
    drawingMarkers.forEach(m => m.setMap(null));

    if ((!isDrawingZone && !isDrawingPath) || drawCoords.length === 0) {
      setDrawingPolyline(null);
      setDrawingMarkers([]);
      return;
    }

    const naverCoords = drawCoords.map(pt => new window.naver.maps.LatLng(pt.lat, pt.lng));

    // Connect vertices
    const polyline = new window.naver.maps.Polyline({
      map: mapInstance,
      path: naverCoords,
      strokeColor: isDrawingZone ? '#6366F1' : '#EF4444',
      strokeOpacity: 0.8,
      strokeWeight: 3,
      strokeStyle: isDrawingZone ? 'dash' : 'solid',
    });
    setDrawingPolyline(polyline);

    // Draw visual point tags
    const newDrawingMarkers = drawCoords.map((pt, idx) => {
      const tagContent = `
        <div style="
          display: flex;
          align-items: center;
          justify-content: center;
          width: 20px;
          height: 20px;
          background-color: ${isDrawingZone ? '#6366F1' : '#EF4444'};
          color: #FFFFFF;
          border: 1.5px solid #FFFFFF;
          border-radius: 50%;
          font-size: 11px;
          font-weight: bold;
        ">
          ${idx + 1}
        </div>
      `;
      return new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(pt.lat, pt.lng),
        map: mapInstance,
        icon: {
          content: tagContent,
          anchor: new window.naver.maps.Point(10, 10),
        },
      });
    });
    setDrawingMarkers(newDrawingMarkers);
  }, [drawCoords, isDrawingZone, isDrawingPath, mapInstance]);

  // Exit drawing helpers
  const cancelDrawing = () => {
    setIsDrawingZone(false);
    setIsDrawingPath(false);
    setDrawCoords([]);
  };

  return (
    <div style={styles.container}>
      {/* MAP MOUNT ELEMENT */}
      <div ref={mapRef} style={styles.map}></div>

      {/* DRAWING CONTROL PANEL */}
      {(isDrawingZone || isDrawingPath) && (
        <div className="glass" style={styles.drawingPanel}>
          <div style={styles.drawingTitle}>
            <MapIcon size={18} color="var(--primary)" />
            <span>{isDrawingZone ? '구역 폴리곤 그리기' : '동선 포인트 지정'}</span>
          </div>
          <p style={styles.drawingInfo}>
            지도를 터치하여 점을 찍어주세요. (최소 {isDrawingZone ? 3 : 2}개)
          </p>

          <div style={styles.drawActions}>
            <button className="btn btn-secondary" style={styles.drawBtn} onClick={cancelDrawing}>
              <X size={16} /> 취소
            </button>
            <button
              className="btn btn-primary"
              style={styles.drawBtn}
              onClick={() => {
                if (isDrawingZone) {
                  if (drawCoords.length < 3) {
                    alert('꼭짓점을 3개 이상 찍어주세요.');
                    return;
                  }
                  onFinishDrawingZone();
                } else {
                  if (drawCoords.length < 2) {
                    alert('동선 포인트를 2개 이상 찍어주세요.');
                    return;
                  }
                  onFinishDrawingPath();
                }
              }}
            >
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      )}

      {/* ADMIN DRAW TRIGGER BUTTONS */}
      {currentUser && currentUser.role === 'admin' && !isDrawingZone && !isDrawingPath && (
        <div style={styles.adminTriggers}>
          <button
            className="btn btn-primary"
            style={styles.actionFloatBtn}
            onClick={() => {
              setIsDrawingZone(true);
              setDrawCoords([]);
            }}
            title="새 구역 그리기"
          >
            <Plus size={20} />
            <span>구역 만들기</span>
          </button>
        </div>
      )}

      {/* ACTIVE PATH INFO & CLEAR TRIGGER */}
      {activePathId && (
        <div className="glass" style={styles.activePathPanel}>
          <div style={styles.activePathText}>
            <ArrowRightLeft size={16} color="#EF4444" />
            <span>동선 표시 중: <strong>{paths.find(p => p.id === activePathId)?.name}</strong></span>
          </div>
          <button
            style={styles.activePathCloseBtn}
            onClick={() => setActivePathId(null)}
          >
            <X size={14} color="var(--text-secondary)" />
          </button>
        </div>
      )}
    </div>
  );
}

const styles = {
  container: {
    width: '100%',
    height: '100%',
    position: 'relative',
  },
  map: {
    width: '100%',
    height: '100%',
  },
  drawingPanel: {
    position: 'absolute',
    bottom: '90px',
    left: '16px',
    right: '16px',
    zIndex: 900,
    borderRadius: 'var(--radius-md)',
    padding: '16px',
    border: '1px solid var(--bg-card-border)',
    boxShadow: 'var(--shadow-lg)',
    animation: 'slideUp 0.3s ease-out',
  },
  drawingTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '700',
    fontSize: '16px',
    color: 'var(--text-primary)',
    marginBottom: '4px',
  },
  drawingInfo: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    marginBottom: '16px',
  },
  drawActions: {
    display: 'flex',
    gap: '12px',
  },
  drawBtn: {
    flex: 1,
    padding: '10px 16px',
    minHeight: '40px',
    fontSize: '14px',
  },
  adminTriggers: {
    position: 'absolute',
    bottom: '24px',
    right: '16px',
    zIndex: 850,
    display: 'flex',
    flexDirection: 'column',
    gap: '12px',
  },
  actionFloatBtn: {
    borderRadius: 'var(--radius-xl)',
    boxShadow: 'var(--shadow-md)',
    gap: '6px',
    padding: '14px 20px',
  },
  activePathPanel: {
    position: 'absolute',
    top: '86px',
    left: '16px',
    right: '16px',
    zIndex: 800,
    padding: '10px 16px',
    borderRadius: 'var(--radius-sm)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    border: '1px solid var(--bg-card-border)',
  },
  activePathText: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontSize: '13px',
    color: 'var(--text-primary)',
  },
  activePathCloseBtn: {
    width: '20px',
    height: '20px',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
};
