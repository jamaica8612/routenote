import React, { useEffect, useRef, useState } from 'react';
import { supabase } from '../supabaseClient';
import { isPointInPolygon, getPolygonCentroid } from '../utils/geoUtils';
import { Navigation, Plus, Check, X, ShieldAlert, Map as MapIcon, ArrowRightLeft, Layers } from 'lucide-react';

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

function getZoneBounds(polygon) {
  if (!polygon?.coordinates?.length || !window.naver?.maps) return null;

  const points = [];

  if (polygon.type === 'MultiPolygon') {
    polygon.coordinates.forEach(coordsGroup => {
      (coordsGroup[0] || []).forEach(([lng, lat]) => points.push({ lat, lng }));
    });
  } else if (polygon.type === 'Polygon') {
    (polygon.coordinates[0] || []).forEach(([lng, lat]) => points.push({ lat, lng }));
  }

  if (points.length === 0) return null;

  const lats = points.map(point => point.lat);
  const lngs = points.map(point => point.lng);
  const southWest = new window.naver.maps.LatLng(Math.min(...lats), Math.min(...lngs));
  const northEast = new window.naver.maps.LatLng(Math.max(...lats), Math.max(...lngs));

  return new window.naver.maps.LatLngBounds(southWest, northEast);
}

function fitZoneOnMap(mapInstance, zone) {
  const bounds = getZoneBounds(zone.polygon);
  if (bounds) {
    mapInstance.fitBounds(bounds, {
      top: 120,
      right: 36,
      bottom: Math.min(320, Math.round(window.innerHeight * 0.38)),
      left: 36,
    });
    return;
  }

  const centroid = getPolygonCentroid(zone.polygon);
  if (centroid) {
    const centerLatLng = new window.naver.maps.LatLng(centroid.lat, centroid.lng);
    mapInstance.setCenter(centerLatLng);
    mapInstance.setZoom(17);
  }
}

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
  drawCoords, // Format: Double Array [ [ {lat,lng}, ... ], [ ... ] ]
  setDrawCoords,
  selectedZone, // [New Prop] Accept currently open/focused zone
  onCreateZone,
  onFinishDrawingZone,
  onFinishDrawingPath,
}) {
  const mapRef = useRef(null);
  const [mapInstance, setMapInstance] = useState(null);
  const [scriptLoaded, setScriptLoaded] = useState(false);
  const [markers, setMarkers] = useState([]);
  const [polygons, setPolygons] = useState([]);
  const [zoneLabels, setZoneLabels] = useState([]);
  const [pathLines, setPathLines] = useState([]);
  
  const [drawingPolylines, setDrawingPolylines] = useState([]);
  const [drawingMarkers, setDrawingMarkers] = useState([]);

  // Refs to prevent map recreation when click handler dependencies change
  const isDrawingZoneRef = useRef(isDrawingZone);
  const isDrawingPathRef = useRef(isDrawingPath);
  const onMapClickRef = useRef(onMapClick);

  useEffect(() => {
    isDrawingZoneRef.current = isDrawingZone;
    isDrawingPathRef.current = isDrawingPath;
    onMapClickRef.current = onMapClick;
  }, [isDrawingZone, isDrawingPath, onMapClick]);

  // Dynamically load Naver Maps JavaScript API at runtime
  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.error('Naver Maps Client ID is missing in environment variables (.env).');
      return;
    }

    if (window.naver && window.naver.maps) {
      setScriptLoaded(true);
      return;
    }

    const existingScript = document.getElementById('naver-maps-script');
    if (existingScript) {
      const handleScriptLoad = () => setScriptLoaded(true);
      existingScript.addEventListener('load', handleScriptLoad);
      return () => existingScript.removeEventListener('load', handleScriptLoad);
    }

    const script = document.createElement('script');
    script.id = 'naver-maps-script';
    script.type = 'text/javascript';
    script.src = `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}&submodules=geocoder,panorama`;
    script.async = true;
    script.defer = true;
    script.onload = () => setScriptLoaded(true);
    script.onerror = () => console.error('Failed to load Naver Maps API script.');
    document.head.appendChild(script);
  }, []);

  // Initialize Naver Map once script is loaded
  useEffect(() => {
    if (!scriptLoaded || !window.naver || !window.naver.maps) {
      return;
    }

    const defaultCenter = new window.naver.maps.LatLng(35.2312, 129.0835); // Pusan National Univ Area
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

    // Try to get user current location for initial center
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const currentLatLng = new window.naver.maps.LatLng(
            position.coords.latitude,
            position.coords.longitude
          );
          map.setCenter(currentLatLng);
        },
        (error) => {
          console.warn('Geolocation initial center failed: ', error.message);
        },
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    // Map Click / Long Press Handling using refs to prevent recreating map
    window.naver.maps.Event.addListener(map, 'click', (e) => {
      const lat = e.coord.lat();
      const lng = e.coord.lng();

      if (!isDrawingZoneRef.current && !isDrawingPathRef.current) {
        onMapClickRef.current(lat, lng);
      } else {
        setDrawCoords(prev => {
          const next = [...prev];
          if (next.length === 0) {
            next.push([]);
          }
          next[next.length - 1] = [...next[next.length - 1], { lat, lng }];
          return next;
        });
      }
    });

    window.naver.maps.Event.addListener(map, 'longpress', (e) => {
      if (!isDrawingZoneRef.current && !isDrawingPathRef.current) {
        onMapClickRef.current(e.coord.lat(), e.coord.lng());
      }
    });

    return () => {
      window.naver.maps.Event.clearInstanceListeners(map);
    };
  }, [scriptLoaded]);

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
      onMarkerClick(selectedResult.data);
    } else if (selectedResult.type === 'zone') {
      const zone = selectedResult.data;
      fitZoneOnMap(mapInstance, zone);
      onZoneClick(zone);
    }
  }, [selectedResult, mapInstance]);

  // Render Saved Zones conditionally (Only when searched/focused)
  useEffect(() => {
    if (!mapInstance || !zones) return;

    // Clear existing polygons and labels
    polygons.forEach(p => p.setMap(null));
    zoneLabels.forEach(l => l.setMap(null));
    
    const newPolygons = [];
    const newLabels = [];

    // Filter zones: ONLY show the zone if it matches selectedResult (searched) OR selectedZone (currently viewed)
    const activeZoneId = selectedResult?.type === 'zone' ? selectedResult.data.id : null;
    const sheetZoneId = selectedZone?.id || null;

    let zonesToShow = [];
    if (activeZoneId || sheetZoneId) {
      zonesToShow = zones.filter(zone => zone.id === activeZoneId || zone.id === sheetZoneId);
    }

    // Disable polygon click actions if drawing mode is active, letting clicks pass through to map
    const shouldBeClickable = !isDrawingZone && !isDrawingPath;

    zonesToShow.forEach(zone => {
      if (zone.is_deleted || !zone.polygon) return;

      const geom = zone.polygon;
      
      // Draw Polygon / MultiPolygon
      if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach(coordsGroup => {
          const naverCoords = coordsGroup[0].map(
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
            clickable: shouldBeClickable, // Block clicks only when not drawing
          });

          if (shouldBeClickable) {
            window.naver.maps.Event.addListener(polygon, 'click', (e) => {
              onZoneClick(zone, e.coord.lat(), e.coord.lng());
            });
          }
          newPolygons.push(polygon);
        });
      } else if (geom.type === 'Polygon') {
        const naverCoords = geom.coordinates[0].map(
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
          clickable: shouldBeClickable, // Block clicks only when not drawing
        });

        if (shouldBeClickable) {
          window.naver.maps.Event.addListener(polygon, 'click', (e) => {
            onZoneClick(zone, e.coord.lat(), e.coord.lng());
          });
        }
        newPolygons.push(polygon);
      }

      // Helper function to render a clean, standard label at a specific centroid
      const renderLabel = (lat, lng, text) => {
        const labelContent = `
          <div style="
            color: #1E293B; /* Slate 800 (darker slate for higher contrast) */
            font-weight: 700;
            font-size: 16px; /* Increased font size */
            white-space: nowrap;
            text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3.5px #fff; /* White blur glow for visibility */
            user-select: none;
            pointer-events: none;
            transform: translate(-50%, -50%);
          ">
            ${text}
          </div>
        `;

        const labelMarker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(lat, lng),
          map: mapInstance,
          icon: {
            content: labelContent,
            anchor: new window.naver.maps.Point(0, 0),
          },
          clickable: false,
        });

        newLabels.push(labelMarker);
      };

      // Draw Zone Centroid Text Label for each polygon element
      if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((coordsGroup, polyIdx) => {
          const singleGeom = {
            type: 'Polygon',
            coordinates: coordsGroup
          };
          const centroid = getPolygonCentroid(singleGeom);
          if (centroid) {
            const labelText = (geom.subLabels && geom.subLabels[polyIdx]) || zone.name;
            renderLabel(centroid.lat, centroid.lng, labelText);
          }
        });
      } else if (geom.type === 'Polygon') {
        const centroid = getPolygonCentroid(geom);
        if (centroid) {
          const labelText = (geom.subLabels && geom.subLabels[0]) || zone.name;
          renderLabel(centroid.lat, centroid.lng, labelText);
        }
      }
    });

    setPolygons(newPolygons);
    setZoneLabels(newLabels);
  }, [zones, mapInstance, selectedResult, selectedZone, isDrawingZone, isDrawingPath]); // Trigger when drawing states change

  // Render Route Tips (Markers with age calculation)
  useEffect(() => {
    if (!mapInstance || !tips) return;

    markers.forEach(m => m.setMap(null));
    const newMarkers = [];

    tips.forEach(tip => {
      if (tip.is_deleted) return;

      let statusClass = 'marker-active';
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
          background = '#9CA3AF';
        } else if (diffDays >= 180) {
          statusClass = 'marker-old';
          opacity = 0.45;
          background = '#4B5563';
          borderStyle = '1.5px dashed #9CA3AF';
        }
      } else {
        statusClass = 'marker-old';
        opacity = 0.45;
        background = '#4B5563';
        borderStyle = '1.5px dashed #9CA3AF';
      }

      const markerTypeObj = MARKER_TYPES[tip.marker_type] || { emoji: '📦' };

      const markerContent = `
        <div class="custom-map-marker ${statusClass}" style="
          display: flex;
          align-items: center;
          justify-content: center;
          font-size: 28px; /* Slightly larger emoji size since we removed borders */
          opacity: ${opacity};
          filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3)); /* Soft shadow for readability */
          transition: all 0.2s;
          cursor: pointer;
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
          anchor: new window.naver.maps.Point(14, 14), // Center anchor for 28px content
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

    pathLines.forEach(pl => pl.setMap(null));
    const newPathLines = [];

    if (!activePathId) {
      setPathLines([]);
      return;
    }

    const drawSavedPath = async () => {
      try {
        const { data: points, error } = await supabase
          .from('rn_route_path_points')
          .select('*')
          .eq('path_id', activePathId)
          .order('order_index', { ascending: true });

        if (error) throw error;
        if (!points || points.length === 0) return;

        const polylineCoords = points.map(pt => new window.naver.maps.LatLng(pt.lat, pt.lng));

        const pathLine = new window.naver.maps.Polyline({
          map: mapInstance,
          path: polylineCoords,
          strokeColor: '#EF4444',
          strokeOpacity: 0.8,
          strokeWeight: 4,
          strokeStyle: 'solid',
          startCap: 'round',
          endCap: 'round',
        });
        newPathLines.push(pathLine);

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

  // Handle Drawing Modes UI (Support MultiPolygons coordinates double loops)
  useEffect(() => {
    if (!mapInstance) return;

    drawingPolylines.forEach(pl => pl.setMap(null));
    drawingMarkers.forEach(m => m.setMap(null));

    const totalPoints = drawCoords.reduce((sum, currentPoly) => sum + currentPoly.length, 0);

    if ((!isDrawingZone && !isDrawingPath) || totalPoints === 0) {
      setDrawingPolylines([]);
      setDrawingMarkers([]);
      return;
    }

    const newPolylines = [];
    const newMarkers = [];

    drawCoords.forEach((currentPoly, polyIdx) => {
      if (currentPoly.length === 0) return;

      const naverCoords = currentPoly.map(pt => new window.naver.maps.LatLng(pt.lat, pt.lng));

      const polyline = new window.naver.maps.Polyline({
        map: mapInstance,
        path: naverCoords,
        strokeColor: isDrawingZone ? '#6366F1' : '#EF4444',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        strokeStyle: isDrawingZone ? 'dash' : 'solid',
      });
      newPolylines.push(polyline);

      currentPoly.forEach((pt, pointIdx) => {
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
            font-size: 10px;
            font-weight: bold;
          ">
            ${isDrawingZone ? `${polyIdx + 1}-${pointIdx + 1}` : `${pointIdx + 1}`}
          </div>
        `;
        const marker = new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(pt.lat, pt.lng),
          map: mapInstance,
          icon: {
            content: tagContent,
            anchor: new window.naver.maps.Point(10, 10),
          },
        });
        newMarkers.push(marker);
      });
    });

    setDrawingPolylines(newPolylines);
    setDrawingMarkers(newMarkers);
  }, [drawCoords, isDrawingZone, isDrawingPath, mapInstance]);

  const cancelDrawing = () => {
    setIsDrawingZone(false);
    setIsDrawingPath(false);
    setDrawCoords([]);
  };

  const addNewPolygonLoop = () => {
    const lastLoop = drawCoords[drawCoords.length - 1];
    if (!lastLoop || lastLoop.length < 3) {
      alert('현재 그리고 있는 영역의 점을 최소 3개 이상 찍은 뒤 추가 영역을 만드세요.');
      return;
    }
    setDrawCoords(prev => [...prev, []]);
  };

  return (
    <div style={styles.container}>
      {!scriptLoaded && (
        <div style={styles.mapLoading}>
          <span>네이버 지도 초기화 중...</span>
        </div>
      )}
      <div ref={mapRef} style={styles.map}></div>

      {(isDrawingZone || isDrawingPath) && (
        <div className="glass" style={styles.drawingPanel}>
          <div style={styles.drawingTitle}>
            <MapIcon size={18} color="var(--primary)" />
            <span>{isDrawingZone ? '구역 폴리곤 그리기' : '동선 포인트 지정'}</span>
          </div>
          
          <p style={styles.drawingInfo}>
            {isDrawingZone 
              ? '지도를 클릭해 영역을 그리세요. 떨어져 있는 구역은 [분리된 영역 추가]를 클릭하여 더 그릴 수 있습니다.' 
              : '동선 순서대로 지도를 클릭해 점을 찍으세요.'}
          </p>

          <div style={styles.drawActions}>
            <button className="btn btn-secondary" style={{ ...styles.drawBtn, flex: 1 }} onClick={cancelDrawing}>
              <X size={16} /> 취소
            </button>

            {isDrawingZone && (
              <button 
                type="button" 
                className="btn btn-secondary" 
                style={{ ...styles.drawBtn, flex: 2, borderColor: 'var(--primary)', color: 'var(--primary)' }} 
                onClick={addNewPolygonLoop}
              >
                <Layers size={16} /> 분리된 영역 추가
              </button>
            )}

            <button
              className="btn btn-primary"
              style={{ ...styles.drawBtn, flex: 1.5 }}
              onClick={() => {
                if (isDrawingZone) {
                  const validLoops = drawCoords.filter(loop => loop.length >= 3);
                  if (validLoops.length === 0) {
                    alert('최소 1개 이상의 올바른 영역(꼭짓점 3개 이상)을 그려주세요.');
                    return;
                  }
                  onFinishDrawingZone();
                } else {
                  const pathPoints = drawCoords[0] || [];
                  if (pathPoints.length < 2) {
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

      {currentUser && currentUser.role === 'admin' && !isDrawingZone && !isDrawingPath && (
        <div style={styles.adminTriggers}>
          <button
            className="btn btn-primary"
            style={styles.actionFloatBtn}
            onClick={() => {
              if (onCreateZone) {
                onCreateZone();
              } else {
                setIsDrawingZone(true);
                setDrawCoords([[]]);
              }
            }}
            title="새 구역 그리기"
          >
            <Plus size={20} />
            <span>구역 만들기</span>
          </button>
        </div>
      )}

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
  mapLoading: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: '100%',
    height: '100%',
    zIndex: 999,
    backgroundColor: '#0B0F19',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: 'var(--text-secondary)',
    fontSize: '14px',
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
    display: 'flex',
    flexDirection: 'column',
    gap: '10px',
  },
  drawingTitle: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    fontWeight: '700',
    fontSize: '16px',
    color: 'var(--text-primary)',
  },
  drawingInfo: {
    fontSize: '13px',
    color: 'var(--text-secondary)',
    lineHeight: '1.4',
  },
  drawActions: {
    display: 'flex',
    gap: '8px',
    width: '100%',
  },
  drawBtn: {
    padding: '10px 12px',
    minHeight: '40px',
    fontSize: '13px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '4px',
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
