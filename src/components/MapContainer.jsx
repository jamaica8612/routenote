import React, { useEffect, useRef, useState } from 'react';
import { ArrowRightLeft, Check, Layers, Locate, Map as MapIcon, Plus, X } from 'lucide-react';
import { supabase } from '../supabaseClient';
import { getPolygonCentroid } from '../utils/geoUtils';

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
    polygon.coordinates.forEach((coordsGroup) => {
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
    mapInstance.setCenter(new window.naver.maps.LatLng(centroid.lat, centroid.lng));
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
  onOpenRoadview,
  isDrawingZone,
  setIsDrawingZone,
  isDrawingPath,
  setIsDrawingPath,
  activePathId,
  setActivePathId,
  drawCoords,
  setDrawCoords,
  selectedZone,
  onCreateZone,
  onFinishDrawingZone,
  onFinishDrawingPath,
  trackLocationTrigger,
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
  const [isTrackingLocation, setIsTrackingLocation] = useState(false);
  const [roadviewMode, setRoadviewMode] = useState(false);

  const isDrawingZoneRef = useRef(isDrawingZone);
  const isDrawingPathRef = useRef(isDrawingPath);
  const onMapClickRef = useRef(onMapClick);
  const roadviewModeRef = useRef(false);
  const locationWatchIdRef = useRef(null);
  const locationMarkerRef = useRef(null);
  const accuracyCircleRef = useRef(null);
  const streetLayerRef = useRef(null);
  const shouldFollowRef = useRef(true);

  useEffect(() => {
    isDrawingZoneRef.current = isDrawingZone;
    isDrawingPathRef.current = isDrawingPath;
    onMapClickRef.current = onMapClick;
  }, [isDrawingZone, isDrawingPath, onMapClick]);

  useEffect(() => {
    roadviewModeRef.current = roadviewMode;
  }, [roadviewMode]);

  useEffect(() => {
    if (trackLocationTrigger > 0 && mapInstance) {
      startLocationTracking();
    }
  }, [trackLocationTrigger, mapInstance]);

  useEffect(() => {
    const clientId = import.meta.env.VITE_NAVER_MAP_CLIENT_ID;
    if (!clientId) {
      console.error('Naver Maps Client ID is missing in environment variables.');
      return;
    }

    if (window.naver?.maps) {
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

  useEffect(() => {
    if (!scriptLoaded || !window.naver?.maps) return;

    const map = new window.naver.maps.Map(mapRef.current, {
      center: new window.naver.maps.LatLng(35.2312, 129.0835),
      zoom: 16,
      minZoom: 10,
      zoomControl: true,
      zoomControlOptions: {
        position: window.naver.maps.Position.RIGHT_CENTER,
      },
      mapTypeControl: true,
      logoControl: false,
    });

    setMapInstance(map);

    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          map.setCenter(new window.naver.maps.LatLng(position.coords.latitude, position.coords.longitude));
        },
        (error) => console.warn('Geolocation initial center failed:', error.message),
        { enableHighAccuracy: true, timeout: 5000 }
      );
    }

    window.naver.maps.Event.addListener(map, 'click', (event) => {
      const lat = event.coord.lat();
      const lng = event.coord.lng();

      if (roadviewModeRef.current && !isDrawingZoneRef.current && !isDrawingPathRef.current) {
        openRoadviewAt(lat, lng);
        return;
      }

      if (!isDrawingZoneRef.current && !isDrawingPathRef.current) {
        onMapClickRef.current(lat, lng);
        return;
      }

      setDrawCoords((prev) => {
        const next = [...prev];
        if (next.length === 0) next.push([]);
        next[next.length - 1] = [...next[next.length - 1], { lat, lng }];
        return next;
      });
    });

    window.naver.maps.Event.addListener(map, 'longpress', (event) => {
      if (!isDrawingZoneRef.current && !isDrawingPathRef.current) {
        onMapClickRef.current(event.coord.lat(), event.coord.lng());
      }
    });

    window.naver.maps.Event.addListener(map, 'dragstart', () => {
      shouldFollowRef.current = false;
    });

    return () => {
      window.naver.maps.Event.clearInstanceListeners(map);
    };
  }, [scriptLoaded, setDrawCoords]);

  useEffect(() => {
    if (!mapInstance || !selectedResult) return;

    shouldFollowRef.current = false;

    if (selectedResult.type === 'address') {
      const { lat, lng } = selectedResult.data;
      mapInstance.setCenter(new window.naver.maps.LatLng(lat, lng));
      mapInstance.setZoom(18);
      return;
    }

    if (selectedResult.type === 'tip') {
      const { lat, lng } = selectedResult.data;
      mapInstance.setCenter(new window.naver.maps.LatLng(lat, lng));
      mapInstance.setZoom(19);
      onMarkerClick(selectedResult.data);
      return;
    }

    if (selectedResult.type === 'zone') {
      fitZoneOnMap(mapInstance, selectedResult.data);
      onZoneClick(selectedResult.data);
    }
  }, [selectedResult, mapInstance]);

  useEffect(() => {
    if (!mapInstance || !zones) return;

    polygons.forEach(polygon => polygon.setMap(null));
    zoneLabels.forEach(label => label.setMap(null));

    const activeZoneId = selectedResult?.type === 'zone' ? selectedResult.data.id : null;
    const sheetZoneId = selectedZone?.id || null;
    const zonesToShow = activeZoneId || sheetZoneId
      ? zones.filter(zone => zone.id === activeZoneId || zone.id === sheetZoneId)
      : [];

    const newPolygons = [];
    const newLabels = [];
    const shouldBeClickable = !isDrawingZone && !isDrawingPath && !roadviewMode;

    const renderLabel = (lat, lng, text) => {
      const labelMarker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(lat, lng),
        map: mapInstance,
        icon: {
          content: `
            <div style="
              color: #1E293B;
              font-weight: 700;
              font-size: 16px;
              white-space: nowrap;
              text-shadow: 0 0 3px #fff, 0 0 3px #fff, 0 0 3.5px #fff;
              user-select: none;
              pointer-events: none;
              transform: translate(-50%, -50%);
            ">${text}</div>
          `,
          anchor: new window.naver.maps.Point(0, 0),
        },
        clickable: false,
      });
      newLabels.push(labelMarker);
    };

    const renderPolygon = (zone, coordsGroup) => {
      const naverCoords = coordsGroup[0].map(([lng, lat]) => new window.naver.maps.LatLng(lat, lng));
      const polygon = new window.naver.maps.Polygon({
        map: mapInstance,
        paths: [naverCoords],
        fillColor: zone.color || '#6366F1',
        fillOpacity: 0.15,
        strokeColor: zone.color || '#6366F1',
        strokeOpacity: 0.8,
        strokeWeight: 2,
        clickable: shouldBeClickable,
      });

      if (shouldBeClickable) {
        window.naver.maps.Event.addListener(polygon, 'click', (event) => {
          onZoneClick(zone, event.coord.lat(), event.coord.lng());
        });
      }

      newPolygons.push(polygon);
    };

    zonesToShow.forEach((zone) => {
      if (zone.is_deleted || !zone.polygon) return;

      const geom = zone.polygon;
      if (geom.type === 'MultiPolygon') {
        geom.coordinates.forEach((coordsGroup, index) => {
          renderPolygon(zone, coordsGroup);
          const centroid = getPolygonCentroid({ type: 'Polygon', coordinates: coordsGroup });
          if (centroid) renderLabel(centroid.lat, centroid.lng, geom.subLabels?.[index] || zone.name);
        });
      } else if (geom.type === 'Polygon') {
        renderPolygon(zone, geom.coordinates);
        const centroid = getPolygonCentroid(geom);
        if (centroid) renderLabel(centroid.lat, centroid.lng, geom.subLabels?.[0] || zone.name);
      }
    });

    setPolygons(newPolygons);
    setZoneLabels(newLabels);
  }, [zones, mapInstance, selectedResult, selectedZone, isDrawingZone, isDrawingPath, roadviewMode]);

  useEffect(() => {
    if (!mapInstance || !tips) return;

    markers.forEach(marker => marker.setMap(null));
    const newMarkers = [];

    tips.forEach((tip) => {
      if (tip.is_deleted) return;

      let statusClass = 'marker-active';
      let opacity = 1;

      if (tip.last_verified_at) {
        const lastVerified = new Date(tip.last_verified_at);
        const days = Math.ceil(Math.abs(new Date() - lastVerified) / (1000 * 60 * 60 * 24));
        if (days >= 90 && days < 180) {
          statusClass = 'marker-warn';
          opacity = 0.65;
        } else if (days >= 180) {
          statusClass = 'marker-old';
          opacity = 0.45;
        }
      } else {
        statusClass = 'marker-old';
        opacity = 0.45;
      }

      const markerType = MARKER_TYPES[tip.marker_type] || MARKER_TYPES.delivery_spot;
      const marker = new window.naver.maps.Marker({
        position: new window.naver.maps.LatLng(tip.lat, tip.lng),
        map: mapInstance,
        title: tip.title,
        icon: {
          content: `
            <div class="custom-map-marker ${statusClass}" style="
              display: flex;
              align-items: center;
              justify-content: center;
              font-size: 28px;
              opacity: ${opacity};
              filter: drop-shadow(0 2px 4px rgba(0,0,0,0.3));
              transition: all 0.2s;
              cursor: pointer;
            ">${markerType.emoji}</div>
          `,
          anchor: new window.naver.maps.Point(14, 14),
        },
      });

      window.naver.maps.Event.addListener(marker, 'click', () => onMarkerClick(tip));
      newMarkers.push(marker);
    });

    setMarkers(newMarkers);
  }, [tips, mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;

    pathLines.forEach(line => line.setMap(null));

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
        if (!points?.length) return;

        const polylineCoords = points.map(point => new window.naver.maps.LatLng(point.lat, point.lng));
        const newPathLines = [
          new window.naver.maps.Polyline({
            map: mapInstance,
            path: polylineCoords,
            strokeColor: '#EF4444',
            strokeOpacity: 0.8,
            strokeWeight: 4,
            strokeStyle: 'solid',
            startCap: 'round',
            endCap: 'round',
          }),
        ];

        points.forEach((point, index) => {
          newPathLines.push(new window.naver.maps.Marker({
            position: new window.naver.maps.LatLng(point.lat, point.lng),
            map: mapInstance,
            title: point.title,
            icon: {
              content: `
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
                ">${index + 1}</div>
              `,
              anchor: new window.naver.maps.Point(12, 12),
            },
          }));
        });

        setPathLines(newPathLines);
      } catch (err) {
        console.error('Error drawing active path:', err);
      }
    };

    drawSavedPath();
  }, [activePathId, mapInstance]);

  useEffect(() => {
    if (!mapInstance) return;

    drawingPolylines.forEach(line => line.setMap(null));
    drawingMarkers.forEach(marker => marker.setMap(null));

    const totalPoints = drawCoords.reduce((sum, currentLoop) => sum + currentLoop.length, 0);
    if ((!isDrawingZone && !isDrawingPath) || totalPoints === 0) {
      setDrawingPolylines([]);
      setDrawingMarkers([]);
      return;
    }

    const newPolylines = [];
    const newMarkers = [];

    drawCoords.forEach((currentLoop, loopIndex) => {
      if (currentLoop.length === 0) return;

      const naverCoords = currentLoop.map(point => new window.naver.maps.LatLng(point.lat, point.lng));
      newPolylines.push(new window.naver.maps.Polyline({
        map: mapInstance,
        path: naverCoords,
        strokeColor: isDrawingZone ? '#6366F1' : '#EF4444',
        strokeOpacity: 0.8,
        strokeWeight: 3,
        strokeStyle: isDrawingZone ? 'dash' : 'solid',
      }));

      currentLoop.forEach((point, pointIndex) => {
        newMarkers.push(new window.naver.maps.Marker({
          position: new window.naver.maps.LatLng(point.lat, point.lng),
          map: mapInstance,
          icon: {
            content: `
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
              ">${isDrawingZone ? `${loopIndex + 1}-${pointIndex + 1}` : `${pointIndex + 1}`}</div>
            `,
            anchor: new window.naver.maps.Point(10, 10),
          },
        }));
      });
    });

    setDrawingPolylines(newPolylines);
    setDrawingMarkers(newMarkers);
  }, [drawCoords, isDrawingZone, isDrawingPath, mapInstance]);

  useEffect(() => () => {
    if (locationWatchIdRef.current !== null) navigator.geolocation.clearWatch(locationWatchIdRef.current);
    locationMarkerRef.current?.setMap(null);
    accuracyCircleRef.current?.setMap(null);
    streetLayerRef.current?.setMap(null);
  }, []);

  const cancelDrawing = () => {
    setIsDrawingZone(false);
    setIsDrawingPath(false);
    setDrawCoords([]);
  };

  const addNewPolygonLoop = () => {
    const lastLoop = drawCoords[drawCoords.length - 1];
    if (!lastLoop || lastLoop.length < 3) {
      alert('현재 그리고 있는 영역의 점을 최소 3개 이상 찍은 뒤 분리된 영역을 추가해주세요.');
      return;
    }
    setDrawCoords(prev => [...prev, []]);
  };

  const openRoadviewAt = (lat, lng) => {
    if (onOpenRoadview) {
      onOpenRoadview(lat, lng);
    } else {
      const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
      const roadviewUrl = isMobile
        ? `https://m.map.naver.com/viewer/panorama.naver?latitude=${lat}&longitude=${lng}`
        : `https://map.naver.com/v5/?c=${lng},${lat},17,0,0,0,dh&p=${lng},${lat},10,0,normal,rv`;
      window.open(roadviewUrl, '_blank', 'noopener,noreferrer');
    }
  };

  const startLocationTracking = () => {
    if (!navigator.geolocation) {
      alert('이 브라우저는 GPS 위치 조회를 지원하지 않습니다.');
      return;
    }

    shouldFollowRef.current = true;

    if (isTrackingLocation) {
      // If already tracking, center map
      if (locationMarkerRef.current) {
        const currentLatLng = locationMarkerRef.current.getPosition();
        if (currentLatLng) {
          mapInstance.setCenter(currentLatLng);
          if (mapInstance.getZoom() < 17) mapInstance.setZoom(17);
        }
      }
      return;
    }

    setIsTrackingLocation(true);
    locationWatchIdRef.current = navigator.geolocation.watchPosition(
      updateCurrentLocationOverlay,
      (error) => {
        stopLocationTracking();
        console.warn('GPS 위치를 가져올 수 없습니다: ' + error.message);
      },
      {
        enableHighAccuracy: true,
        maximumAge: 1000,
        timeout: 10000,
      }
    );
  };

  const handleToggleRoadviewMode = () => {
    if (!mapInstance || !window.naver?.maps) return;

    const nextMode = !roadviewMode;
    setRoadviewMode(nextMode);

    if (!streetLayerRef.current && window.naver.maps.StreetLayer) {
      streetLayerRef.current = new window.naver.maps.StreetLayer();
    }

    streetLayerRef.current?.setMap(nextMode ? mapInstance : null);

    // If turning on roadview mode, automatically enable location tracking so they see the blue dot!
    if (nextMode) {
      shouldFollowRef.current = true;
      startLocationTracking();
    } else {
      stopLocationTracking();
    }
  };

  const updateCurrentLocationOverlay = (position) => {
    if (!mapInstance || !window.naver?.maps) return;

    const { latitude, longitude, accuracy } = position.coords;
    const currentLatLng = new window.naver.maps.LatLng(latitude, longitude);

    if (!locationMarkerRef.current) {
      locationMarkerRef.current = new window.naver.maps.Marker({
        position: currentLatLng,
        map: mapInstance,
        icon: {
          content: `
            <div style="position: relative; width: 22px; height: 22px;">
              <!-- Pulsing Halo -->
              <div class="current-location-pulse" style="
                position: absolute;
                top: 0;
                left: 0;
                width: 22px;
                height: 22px;
                border-radius: 50%;
                background: rgba(37, 99, 235, 0.4);
                pointer-events: none;
              "></div>
              <!-- Center Blue Dot -->
              <div style="
                position: absolute;
                top: 2px;
                left: 2px;
                width: 18px;
                height: 18px;
                border-radius: 50%;
                background: #2563EB;
                border: 3.5px solid #FFFFFF;
                box-shadow: 0 2px 8px rgba(37, 99, 235, 0.55);
              "></div>
            </div>
          `,
          anchor: new window.naver.maps.Point(11, 11),
        },
      });
    } else {
      locationMarkerRef.current.setPosition(currentLatLng);
      locationMarkerRef.current.setMap(mapInstance);
    }

    if (!accuracyCircleRef.current) {
      accuracyCircleRef.current = new window.naver.maps.Circle({
        map: mapInstance,
        center: currentLatLng,
        radius: accuracy || 30,
        fillColor: '#2563EB',
        fillOpacity: 0.12,
        strokeColor: '#2563EB',
        strokeOpacity: 0.35,
        strokeWeight: 1,
      });
    } else {
      accuracyCircleRef.current.setCenter(currentLatLng);
      accuracyCircleRef.current.setRadius(accuracy || 30);
      accuracyCircleRef.current.setMap(mapInstance);
    }

    if (shouldFollowRef.current) {
      mapInstance.setCenter(currentLatLng);
      if (mapInstance.getZoom() < 17) mapInstance.setZoom(17);
    }
  };

  const stopLocationTracking = () => {
    if (locationWatchIdRef.current !== null) {
      navigator.geolocation.clearWatch(locationWatchIdRef.current);
      locationWatchIdRef.current = null;
    }
    setIsTrackingLocation(false);
    if (locationMarkerRef.current) {
      locationMarkerRef.current.setMap(null);
    }
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setMap(null);
    }
  };

  const handleToggleLocationTracking = () => {
    if (isTrackingLocation) {
      stopLocationTracking();
    } else {
      startLocationTracking();
    }
  };

  return (
    <div style={styles.container}>
      {!scriptLoaded && (
        <div style={styles.mapLoading}>
          <span>네이버 지도 초기화 중...</span>
        </div>
      )}
      <div ref={mapRef} style={styles.map} />

      {!isDrawingZone && !isDrawingPath && (
        <button
          type="button"
          className="glass"
          style={{
            ...styles.roadviewFloatBtn(currentUser?.role === 'admin'),
            backgroundColor: roadviewMode ? 'rgba(37, 99, 235, 0.9)' : styles.roadviewFloatBtn(currentUser?.role === 'admin').backgroundColor,
          }}
          onClick={handleToggleRoadviewMode}
          title="로드뷰 모드"
        >
          <MapIcon size={17} color="#FFFFFF" />
          <span>로드뷰</span>
        </button>
      )}

      {roadviewMode && !isDrawingZone && !isDrawingPath && (
        <div className="glass" style={styles.roadviewHint}>
          로드뷰를 볼 도로를 지도에서 선택하세요.
        </div>
      )}

      {(isDrawingZone || isDrawingPath) && (
        <div className="glass" style={styles.drawingPanel}>
          <div style={styles.drawingTitle}>
            <MapIcon size={18} color="var(--primary)" />
            <span>{isDrawingZone ? '구역 폴리곤 그리기' : '동선 포인트 지정'}</span>
          </div>

          <p style={styles.drawingInfo}>
            {isDrawingZone
              ? '지도를 클릭해 영역을 그리세요. 떨어져 있는 구역은 [분리된 영역 추가]를 눌러 이어서 그릴 수 있습니다.'
              : '동선 순서대로 지도를 클릭해 포인트를 찍으세요.'}
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
                    alert('최소 1개 이상의 올바른 영역을 그려주세요. 꼭짓점은 3개 이상이어야 합니다.');
                    return;
                  }
                  onFinishDrawingZone();
                  return;
                }

                const pathPoints = drawCoords[0] || [];
                if (pathPoints.length < 2) {
                  alert('동선 포인트를 2개 이상 찍어주세요.');
                  return;
                }
                onFinishDrawingPath();
              }}
            >
              <Check size={16} /> 완료
            </button>
          </div>
        </div>
      )}

      {currentUser?.role === 'admin' && !isDrawingZone && !isDrawingPath && (
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
            <span>동선 표시 중 <strong>{paths.find(path => path.id === activePathId)?.name || ''}</strong></span>
          </div>
          <button style={styles.activePathCloseBtn} onClick={() => setActivePathId(null)}>
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
  roadviewFloatBtn: (isAdmin) => ({
    position: 'absolute',
    left: isAdmin ? '16px' : 'auto',
    right: isAdmin ? 'auto' : '16px',
    bottom: '92px',
    zIndex: 850,
    minWidth: '82px',
    height: '42px',
    borderRadius: '999px',
    border: '1px solid rgba(255, 255, 255, 0.14)',
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    color: '#FFFFFF',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '6px',
    fontSize: '13px',
    fontWeight: '700',
    cursor: 'pointer',
    boxShadow: 'var(--shadow-md)',
    backdropFilter: 'blur(8px)',
    WebkitBackdropFilter: 'blur(8px)',
  }),
  roadviewHint: {
    position: 'absolute',
    left: '16px',
    right: '16px',
    bottom: '144px',
    zIndex: 850,
    padding: '10px 14px',
    borderRadius: 'var(--radius-md)',
    border: '1px solid var(--bg-card-border)',
    color: 'var(--text-primary)',
    fontSize: '13px',
    fontWeight: '700',
    textAlign: 'center',
    boxShadow: 'var(--shadow-md)',
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
    top: '132px',
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
