'use client';
import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

interface PostalCodeItem {
  postalCode: string;
  village: string;
  district: string;
  regency: string;
  latitude: number;
  longitude: number;
  distance: number;
  isPartial?: boolean;
}

interface MapProps {
  theme: string;
  storeLat: number;
  storeLng: number;
  radiusKm: number;
  filteredRecords: PostalCodeItem[];
  outsideRecords: PostalCodeItem[];
  showOutsideMarkers: boolean;
  onMarkerDrag: (lat: number, lng: number) => void;
  onMarkerDragEnd?: (lat: number, lng: number) => void;
  onMapDoubleClick: (lat: number, lng: number) => void;
  selectedRecord: PostalCodeItem | null;
  routePath: [number, number][];
}

export default function Map({
  theme,
  storeLat,
  storeLng,
  radiusKm,
  filteredRecords,
  outsideRecords,
  showOutsideMarkers,
  onMarkerDrag,
  onMarkerDragEnd,
  onMapDoubleClick,
  selectedRecord,
  routePath
}: MapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const tileLayerRef = useRef<L.TileLayer | null>(null);
  const storeMarkerRef = useRef<L.Marker | null>(null);
  const radiusCircleRef = useRef<L.Circle | null>(null);
  const postcodeLayerRef = useRef<L.LayerGroup | null>(null);
  const outsideLayerRef = useRef<L.LayerGroup | null>(null);
  const routePolylineRef = useRef<L.Polyline | null>(null);
  const markersMapRef = useRef<Record<string, L.CircleMarker>>({});

  const onMarkerDragRef = useRef(onMarkerDrag);
  const onMarkerDragEndRef = useRef(onMarkerDragEnd);
  const onMapDoubleClickRef = useRef(onMapDoubleClick);

  // Keep callback references fresh on each render
  useEffect(() => {
    onMarkerDragRef.current = onMarkerDrag;
    onMarkerDragEndRef.current = onMarkerDragEnd;
    onMapDoubleClickRef.current = onMapDoubleClick;
  });

  // Initialize Map
  useEffect(() => {
    if (!mapRef.current || mapInstanceRef.current) return;

    // Fix default marker icon issues in Leaflet + Next.js
    // @ts-ignore
    delete L.Icon.Default.prototype._getIconUrl;
    L.Icon.Default.mergeOptions({
      iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
      iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
      shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
    });

    const map = L.map(mapRef.current, {
      center: [storeLat, storeLng],
      zoom: 11,
      zoomControl: true,
      doubleClickZoom: false
    });

    const tileUrl = theme === 'light'
      ? "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png"
      : "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";

    const tileLayer = L.tileLayer(tileUrl, {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
      subdomains: 'abcd',
      maxZoom: 20
    }).addTo(map);

    tileLayerRef.current = tileLayer;

    postcodeLayerRef.current = L.layerGroup().addTo(map);
    outsideLayerRef.current = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;

    // Main Store Marker
    const storeMarker = L.marker([storeLat, storeLng], {
      draggable: true,
      title: "Toko Pusat (Topsell Bhayangkara)",
      riseOnHover: true
    }).addTo(map);

    storeMarker.bindTooltip("<b>Toko Pusat (Topsell)</b><br>Seret pin untuk memindahkan lokasi.", {
      permanent: false,
      direction: 'top'
    });

    storeMarkerRef.current = storeMarker;

    // Radius Circle
    const radiusCircle = L.circle([storeLat, storeLng], {
      radius: radiusKm * 1000,
      color: 'var(--accent-cyan)',
      fillColor: 'var(--accent-cyan)',
      fillOpacity: 0.08,
      weight: 1.5,
      dashArray: '4, 4'
    }).addTo(map);

    radiusCircleRef.current = radiusCircle;

    // Add Legend Control
    const legend = new L.Control({ position: 'bottomright' });
    legend.onAdd = function () {
      const div = L.DomUtil.create('div', 'map-legend');
      div.innerHTML = `
        <div class="map-legend-title">Legenda Jangkauan</div>
        <div class="map-legend-item">
            <span class="map-legend-dot legend-store"></span>
            <span>Toko Pusat (Topsell)</span>
        </div>
        <div class="map-legend-item">
            <span class="map-legend-dot legend-in-radius"></span>
            <span>Dalam Radius (Tercover)</span>
        </div>
        <div class="map-legend-item">
            <span class="map-legend-dot legend-partial-out"></span>
            <span>Luar Radius (Sebagian Tercover)</span>
        </div>
      `;
      return div;
    };
    legend.addTo(map);

    // Event Listeners
    storeMarker.on('drag', (e) => {
      const position = e.target.getLatLng();
      radiusCircle.setLatLng(position);
      if (onMarkerDragRef.current) onMarkerDragRef.current(position.lat, position.lng);
    });

    storeMarker.on('dragend', (e) => {
      const position = e.target.getLatLng();
      if (onMarkerDragEndRef.current) onMarkerDragEndRef.current(position.lat, position.lng);
    });

    map.on('dblclick', (e) => {
      const position = e.latlng;
      storeMarker.setLatLng(position);
      radiusCircle.setLatLng(position);
      if (onMapDoubleClickRef.current) onMapDoubleClickRef.current(position.lat, position.lng);
    });

    return () => {
      map.remove();
      mapInstanceRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Update Store Marker & Circle position when prop changes
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    const center: [number, number] = [storeLat, storeLng];
    
    if (storeMarkerRef.current) {
      storeMarkerRef.current.setLatLng(center);
    }
    if (radiusCircleRef.current) {
      radiusCircleRef.current.setLatLng(center);
      radiusCircleRef.current.setRadius(radiusKm * 1000);
    }
  }, [storeLat, storeLng, radiusKm]);

  // Update Tile Layer Theme dynamically
  useEffect(() => {
    if (!tileLayerRef.current) return;
    const lightUrl = "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
    const darkUrl = "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png";
    tileLayerRef.current.setUrl(theme === 'light' ? lightUrl : darkUrl);
  }, [theme]);

  // Render Inside Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !postcodeLayerRef.current) return;
    postcodeLayerRef.current.clearLayers();
    markersMapRef.current = {};

    const maxVisibleMarkers = 800;
    if (filteredRecords.length <= maxVisibleMarkers) {
      filteredRecords.forEach(item => {
        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius: 4,
          color: 'var(--accent-cyan)',
          fillColor: 'var(--bg-main)',
          fillOpacity: 0.8,
          weight: 1.5
        });

        // Store reference
        const key = `${item.latitude}-${item.longitude}`;
        markersMapRef.current[key] = marker;

        const gmapsLink = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
        const popupContent = `
          <div class="map-popup">
              <h4>${item.village} (${item.postalCode})</h4>
              <p><b>Kecamatan:</b> ${item.district}</p>
              <p><b>Kabupaten:</b> ${item.regency}</p>
              <p><b>Status:</b> <span class="${item.isPartial ? 'badge-partial' : 'badge-full'}">${item.isPartial ? 'Sebagian' : 'Penuh'}</span></p>
              <p class="popup-distance"><i data-lucide="navigation" style="width: 12px; height: 12px; display: inline-block;"></i> Jarak Udara: <b>${item.distance} km</b></p>
              <div style="margin-top: 8px;">
                  <a href="${gmapsLink}" target="_blank" class="btn-gmaps" style="display: block; text-align: center; font-size: 10px; padding: 4px 8px;">Verifikasi di Google Maps</a>
              </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 240,
          closeButton: false
        });

        postcodeLayerRef.current.addLayer(marker);
      });
    }
  }, [filteredRecords, storeLat, storeLng]);

  // Render Outside Markers
  useEffect(() => {
    if (!mapInstanceRef.current || !outsideLayerRef.current) return;
    outsideLayerRef.current.clearLayers();

    if (showOutsideMarkers && outsideRecords) {
      outsideRecords.forEach(item => {
        const marker = L.circleMarker([item.latitude, item.longitude], {
          radius: 3,
          color: 'var(--warning)',
          fillColor: 'var(--bg-card)',
          fillOpacity: 0.4,
          opacity: 0.7,
          weight: 1
        });

        const gmapsLink = `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${item.latitude},${item.longitude}`;
        const popupContent = `
          <div class="map-popup">
              <h4 style="color: var(--warning);">${item.village} (${item.postalCode})</h4>
              <p style="color: var(--text-muted); font-size: 9px; font-weight: 700; text-transform: uppercase;">Di Luar Radius Jangkauan</p>
              <p><b>Kecamatan:</b> ${item.district}</p>
              <p><b>Kabupaten:</b> ${item.regency}</p>
              <p class="popup-distance" style="color: var(--warning);"><i data-lucide="navigation" style="width: 12px; height: 12px; display: inline-block;"></i> Jarak Udara: <b>${item.distance} km</b> (Radius: ${radiusKm} km)</p>
              <div style="margin-top: 8px;">
                  <a href="${gmapsLink}" target="_blank" class="btn-gmaps" style="display: block; text-align: center; font-size: 10px; padding: 4px 8px;">Verifikasi di Google Maps</a>
              </div>
          </div>
        `;

        marker.bindPopup(popupContent, {
          maxWidth: 240,
          closeButton: false
        });

        outsideLayerRef.current.addLayer(marker);
      });
    }
  }, [outsideRecords, showOutsideMarkers, storeLat, storeLng, radiusKm]);

  // Fly to and open popup for Selected Record
  useEffect(() => {
    if (!mapInstanceRef.current || !selectedRecord) return;
    const { latitude, longitude } = selectedRecord;
    
    mapInstanceRef.current.flyTo([latitude, longitude], 14, {
      animate: true,
      duration: 1.0
    });

    const key = `${latitude}-${longitude}`;
    const marker = markersMapRef.current[key];
    if (marker) {
      setTimeout(() => {
        marker.openPopup();
      }, 1000);
    }
  }, [selectedRecord]);

  // Render OSRM Route Path Polyline
  useEffect(() => {
    if (!mapInstanceRef.current) return;
    
    // Clear old route polyline
    if (routePolylineRef.current) {
      mapInstanceRef.current.removeLayer(routePolylineRef.current);
      routePolylineRef.current = null;
    }

    if (routePath && routePath.length > 0) {
      // routePath is an array of [lat, lng] points
      const polyline = L.polyline(routePath, {
        color: 'var(--accent-cyan)',
        weight: 4,
        opacity: 0.8,
        dashArray: '5, 10',
        lineCap: 'round',
        lineJoin: 'round'
      }).addTo(mapInstanceRef.current);
      
      // Animation effect for route line
      let offset = 0;
      let animationFrameId: number;
      const animateRoute = () => {
        if (!polyline || !mapInstanceRef.current) return;
        offset = (offset + 1) % 20;
        polyline.setStyle({ dashOffset: (-offset).toString() });
        animationFrameId = requestAnimationFrame(animateRoute);
      };
      
      animateRoute();
      routePolylineRef.current = polyline;

      return () => {
        cancelAnimationFrame(animationFrameId);
      };
    }
  }, [routePath]);

  return <div ref={mapRef} style={{ height: '100%', width: '100%', minHeight: '320px' }} />;
}
