import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { GeoPoint, ProjectedPosition, Trail, TurnCue, UserPosition, BreadcrumbPoint } from '../types';
import { Crosshair, Maximize2, ZoomIn, ZoomOut, Route } from 'lucide-react';
import { Units, formatElevation } from '../utils/units';

interface TrailMapProps {
  trail: Trail;
  userPosition: UserPosition | null;
  projectedPosition: ProjectedPosition | null;
  targetPoint: GeoPoint | null;
  turnCues: TurnCue[];
  followMe: boolean;
  onToggleFollowMe: () => void;
  onDisableFollowMe?: () => void;
  heading: number;
  highContrastMode: 'dark-slate' | 'sunlight-bright';
  breadcrumbs?: BreadcrumbPoint[][];
  units?: Units;
}

export const TrailMap: React.FC<TrailMapProps> = ({
  trail,
  userPosition,
  projectedPosition,
  targetPoint,
  turnCues,
  followMe,
  onToggleFollowMe,
  onDisableFollowMe,
  heading,
  highContrastMode,
  breadcrumbs = [],
  units = 'imperial',
}) => {
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);

  const [showMyRoute, setShowMyRoute] = useState(true);

  const onDisableFollowMeRef = useRef(onDisableFollowMe);
  const onToggleFollowMeRef = useRef(onToggleFollowMe);
  const followMeRef = useRef(followMe);
  const breadcrumbsRef = useRef(breadcrumbs);
  const showMyRouteRef = useRef(showMyRoute);

  useEffect(() => {
    onDisableFollowMeRef.current = onDisableFollowMe;
    onToggleFollowMeRef.current = onToggleFollowMe;
    followMeRef.current = followMe;
    breadcrumbsRef.current = breadcrumbs;
    showMyRouteRef.current = showMyRoute;
  }, [onDisableFollowMe, onToggleFollowMe, followMe, breadcrumbs, showMyRoute]);

  // Layers
  const trailPolylineOutlineRef = useRef<L.Polyline | null>(null);
  const trailPolylineCoreRef = useRef<L.Polyline | null>(null);
  const myRouteCanvasRef = useRef<L.Canvas | null>(null);
  const myRouteGroupRef = useRef<L.LayerGroup | null>(null);
  const myRoutePolylinesRef = useRef<L.Polyline[]>([]);
  const lastRenderedSegCountRef = useRef<number>(0);
  const lastRenderedPtCountRef = useRef<number>(0);

  const userMarkerRef = useRef<L.Marker | null>(null);
  const accuracyCircleRef = useRef<L.Circle | null>(null);
  const projectionLineRef = useRef<L.Polyline | null>(null);
  const targetMarkerRef = useRef<L.CircleMarker | null>(null);
  const turnMarkersGroupRef = useRef<L.LayerGroup | null>(null);
  const waypointsGroupRef = useRef<L.LayerGroup | null>(null);

  const isDayMode = highContrastMode === 'sunlight-bright';
  // Canvas-rendered layers (the live "My Route" breadcrumb) can't resolve CSS custom
  // properties, since canvas 2D color parsing doesn't go through the CSS cascade — so that
  // one color needs a literal hex per theme, matching --accent in src/index.css.
  const myRouteColor = isDayMode ? '#D9622B' : '#FFB020';

  // Initialize Map
  useEffect(() => {
    if (!mapContainerRef.current || mapInstanceRef.current) return;

    // First point or center of trail
    const startPoint = trail.points[0] || { lat: 37.7749, lon: -122.4194 };

    const map = L.map(mapContainerRef.current, {
      center: [startPoint.lat, startPoint.lon],
      zoom: 16,
      zoomControl: false, // We provide large sunlight-readable buttons
      attributionControl: false,
    });

    const tileUrl = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

    L.tileLayer(tileUrl, {
      maxZoom: 19,
      subdomains: 'abc',
    }).addTo(map);

    // Initial trail fit bounds
    if (trail.points.length > 0) {
      const latLngs = trail.points.map(p => [p.lat, p.lon] as [number, number]);
      const bounds = L.latLngBounds(latLngs);
      map.fitBounds(bounds, { padding: [40, 40] });
    }

    // Double-stroke Trail line for maximum outdoor sunlight readability.
    // Multi-segment array avoids bridging gaps between distinct trkseg/trk.
    // Default (SVG) renderer, so these are real DOM <path> elements and can use CSS variables.
    const polylineSegments =
      trail.segments && trail.segments.length > 0
        ? trail.segments.map(seg => seg.map(p => [p.lat, p.lon] as [number, number]))
        : [trail.points.map(p => [p.lat, p.lon] as [number, number])];

    // Outer dark outline
    const outline = L.polyline(polylineSegments, {
      color: 'var(--border-color)',
      weight: 10,
      opacity: 0.9,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    trailPolylineOutlineRef.current = outline;

    // Inner bright vivid line
    const core = L.polyline(polylineSegments, {
      color: 'var(--accent-2)',
      weight: 6,
      opacity: 1,
      lineCap: 'round',
      lineJoin: 'round',
    }).addTo(map);
    trailPolylineCoreRef.current = core;

    // Live "My Route" Layer Group & Canvas Renderer
    // Drawn above the planned trail line, below markers
    // Leaflet stacks SVG layers (z-index 200) above canvas layers (z-index 100) within the same
    // pane, which hid the route under the SVG trail. Give the route its own pane above the overlay pane.
    if (!map.getPane('myRoutePane')) {
      const routePane = map.createPane('myRoutePane');
      routePane.style.zIndex = '450';
      routePane.style.pointerEvents = 'none';
    }
    const routeCanvas = L.canvas({ padding: 0.5, pane: 'myRoutePane' });
    myRouteCanvasRef.current = routeCanvas;

    const routeGroup = L.layerGroup();
    if (showMyRouteRef.current) {
      routeGroup.addTo(map);
    }
    myRouteGroupRef.current = routeGroup;

    // Redraw the whole route from the breadcrumb array after the map is re-initialized
    myRoutePolylinesRef.current = [];
    const currentCrumbs = breadcrumbsRef.current;
    if (currentCrumbs && currentCrumbs.length > 0) {
      currentCrumbs.forEach(seg => {
        if (seg.length > 0) {
          const latLngs = seg.map(pt => [pt.lat, pt.lon] as [number, number]);
          const polyline = L.polyline(latLngs, {
            renderer: routeCanvas,
            color: myRouteColor,
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          });
          routeGroup.addLayer(polyline);
          myRoutePolylinesRef.current.push(polyline);
        }
      });
      lastRenderedSegCountRef.current = currentCrumbs.length;
      const lastSeg = currentCrumbs[currentCrumbs.length - 1];
      lastRenderedPtCountRef.current = lastSeg ? lastSeg.length : 0;
    } else {
      lastRenderedSegCountRef.current = 0;
      lastRenderedPtCountRef.current = 0;
    }

    // Start Marker
    if (trail.points.length > 0) {
      const start = trail.points[0];
      const startIcon = L.divIcon({
        className: 'custom-start-marker',
        html: `<div style="background:var(--accent-2);color:white;width:24px;height:24px;border-radius:50%;border:3px solid var(--surface);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 3px 8px rgba(0,0,0,0.5);">S</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([start.lat, start.lon], { icon: startIcon }).addTo(map);
    }

    // End Marker
    if (trail.points.length > 1) {
      const end = trail.points[trail.points.length - 1];
      const endIcon = L.divIcon({
        className: 'custom-end-marker',
        html: `<div style="background:var(--danger);color:white;width:24px;height:24px;border-radius:50%;border:3px solid var(--surface);display:flex;align-items:center;justify-content:center;font-weight:900;font-size:12px;box-shadow:0 3px 8px rgba(0,0,0,0.5);">E</div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
      });
      L.marker([end.lat, end.lon], { icon: endIcon }).addTo(map);
    }

    // Turn Cues layer group
    const turnGroup = L.layerGroup().addTo(map);
    turnMarkersGroupRef.current = turnGroup;

    // Waypoints layer group
    const wptGroup = L.layerGroup().addTo(map);
    waypointsGroupRef.current = wptGroup;

    // Guidance/Projection line
    const projLine = L.polyline([], {
      color: 'var(--info)',
      weight: 3,
      dashArray: '6, 6',
      opacity: 0.9,
    }).addTo(map);
    projectionLineRef.current = projLine;

    // Target lookahead marker
    const targetMarker = L.circleMarker([startPoint.lat, startPoint.lon], {
      radius: 6,
      fillColor: 'var(--accent)',
      fillOpacity: 0.9,
      color: 'var(--border-color)',
      weight: 2,
    }).addTo(map);
    targetMarkerRef.current = targetMarker;

    // User accuracy circle
    const accCircle = L.circle([startPoint.lat, startPoint.lon], {
      radius: 10,
      color: 'var(--info)',
      fillColor: 'var(--info)',
      fillOpacity: userPosition ? 0.15 : 0,
      opacity: userPosition ? 1 : 0,
      weight: 1,
    }).addTo(map);
    accuracyCircleRef.current = accCircle;

    // User location marker (dot with radar ring and orientation pointer)
    const userDivIcon = L.divIcon({
      className: 'user-live-marker',
      html: `
        <div id="user-live-dot-wrapper" style="position:relative;width:32px;height:32px;display:flex;align-items:center;justify-content:center;">
          <div style="position:absolute;width:32px;height:32px;border-radius:50%;background:var(--info);opacity:0.35;animation:pulse 2s infinite;"></div>
          <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:var(--info);border:3px solid var(--surface);box-shadow:0 2px 6px rgba(0,0,0,0.5);"></div>
        </div>
      `,
      iconSize: [32, 32],
      iconAnchor: [16, 16],
    });

    const userMarker = L.marker([startPoint.lat, startPoint.lon], {
      icon: userDivIcon,
      zIndexOffset: 1000,
      opacity: userPosition ? 1 : 0,
    }).addTo(map);
    userMarkerRef.current = userMarker;

    // If no user position yet, fit the map view to the whole trail
    if (!userPosition && trail.points.length > 0) {
      const latLngs = trail.points.map(p => [p.lat, p.lon] as [number, number]);
      map.fitBounds(L.latLngBounds(latLngs), { padding: [40, 40] });
    }

    mapInstanceRef.current = map;

    // Disable followMe if user manually drags the map
    map.on('dragstart', () => {
      if (onDisableFollowMeRef.current) {
        onDisableFollowMeRef.current();
      } else if (followMeRef.current) {
        onToggleFollowMeRef.current();
      }
    });

    // Invalidate size on load & when dimensions change
    setTimeout(() => {
      map.invalidateSize();
    }, 250);

    const resizeObserver = new ResizeObserver(() => {
      map.invalidateSize();
    });
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
      map.remove();
      mapInstanceRef.current = null;
      myRouteGroupRef.current = null;
      myRouteCanvasRef.current = null;
      myRoutePolylinesRef.current = [];
      lastRenderedSegCountRef.current = 0;
      lastRenderedPtCountRef.current = 0;
    };
  }, [trail.id]);

  // Incremental Live Route polyline updates
  useEffect(() => {
    if (!mapInstanceRef.current || !myRouteGroupRef.current || !myRouteCanvasRef.current) return;
    const currentCrumbs = breadcrumbs || [];

    // If empty, clear layers
    if (currentCrumbs.length === 0) {
      myRouteGroupRef.current.clearLayers();
      myRoutePolylinesRef.current = [];
      lastRenderedSegCountRef.current = 0;
      lastRenderedPtCountRef.current = 0;
      return;
    }

    // If map was created or layer was empty, draw all segments
    if (myRoutePolylinesRef.current.length === 0) {
      currentCrumbs.forEach(seg => {
        if (seg.length > 0) {
          const latLngs = seg.map(pt => [pt.lat, pt.lon] as [number, number]);
          const polyline = L.polyline(latLngs, {
            renderer: myRouteCanvasRef.current!,
            color: myRouteColor,
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          });
          myRouteGroupRef.current!.addLayer(polyline);
          myRoutePolylinesRef.current.push(polyline);
        }
      });
      lastRenderedSegCountRef.current = currentCrumbs.length;
      const lastSeg = currentCrumbs[currentCrumbs.length - 1];
      lastRenderedPtCountRef.current = lastSeg ? lastSeg.length : 0;
      return;
    }

    // Case 1: Same number of segments -> add new points incrementally using addLatLng
    if (currentCrumbs.length === lastRenderedSegCountRef.current) {
      const segIdx = currentCrumbs.length - 1;
      const seg = currentCrumbs[segIdx];
      const polyline = myRoutePolylinesRef.current[segIdx];
      if (polyline && seg) {
        for (let i = lastRenderedPtCountRef.current; i < seg.length; i++) {
          polyline.addLatLng([seg[i].lat, seg[i].lon]);
        }
        lastRenderedPtCountRef.current = seg.length;
      }
      return;
    }

    // Case 2: New segment(s) started -> complete prior segment, then create new polylines
    if (currentCrumbs.length > lastRenderedSegCountRef.current) {
      const prevIdx = lastRenderedSegCountRef.current - 1;
      if (prevIdx >= 0 && prevIdx < myRoutePolylinesRef.current.length) {
        const prevSeg = currentCrumbs[prevIdx];
        const prevPolyline = myRoutePolylinesRef.current[prevIdx];
        if (prevPolyline && prevSeg) {
          for (let i = lastRenderedPtCountRef.current; i < prevSeg.length; i++) {
            prevPolyline.addLatLng([prevSeg[i].lat, prevSeg[i].lon]);
          }
        }
      }

      for (let s = lastRenderedSegCountRef.current; s < currentCrumbs.length; s++) {
        const newSeg = currentCrumbs[s];
        const latLngs = newSeg.map(pt => [pt.lat, pt.lon] as [number, number]);
        const polyline = L.polyline(latLngs, {
          renderer: myRouteCanvasRef.current!,
          color: myRouteColor,
          weight: 5,
          opacity: 0.95,
          lineCap: 'round',
          lineJoin: 'round',
        });
        myRouteGroupRef.current.addLayer(polyline);
        myRoutePolylinesRef.current.push(polyline);
      }
      lastRenderedSegCountRef.current = currentCrumbs.length;
      const lastSeg = currentCrumbs[currentCrumbs.length - 1];
      lastRenderedPtCountRef.current = lastSeg ? lastSeg.length : 0;
      return;
    }

    // Case 3: Breadcrumb segments array shrank (e.g. restart/clear) -> clear and redraw
    if (currentCrumbs.length < lastRenderedSegCountRef.current) {
      myRouteGroupRef.current.clearLayers();
      myRoutePolylinesRef.current = [];
      currentCrumbs.forEach(seg => {
        if (seg.length > 0) {
          const latLngs = seg.map(pt => [pt.lat, pt.lon] as [number, number]);
          const polyline = L.polyline(latLngs, {
            renderer: myRouteCanvasRef.current!,
            color: myRouteColor,
            weight: 5,
            opacity: 0.95,
            lineCap: 'round',
            lineJoin: 'round',
          });
          myRouteGroupRef.current!.addLayer(polyline);
          myRoutePolylinesRef.current.push(polyline);
        }
      });
      lastRenderedSegCountRef.current = currentCrumbs.length;
      const lastSeg = currentCrumbs[currentCrumbs.length - 1];
      lastRenderedPtCountRef.current = lastSeg ? lastSeg.length : 0;
    }
  }, [breadcrumbs, myRouteColor]);

  // Toggle My Route visibility
  useEffect(() => {
    if (!mapInstanceRef.current || !myRouteGroupRef.current) return;
    if (showMyRoute) {
      if (!mapInstanceRef.current.hasLayer(myRouteGroupRef.current)) {
        mapInstanceRef.current.addLayer(myRouteGroupRef.current);
      }
    } else {
      if (mapInstanceRef.current.hasLayer(myRouteGroupRef.current)) {
        mapInstanceRef.current.removeLayer(myRouteGroupRef.current);
      }
    }
  }, [showMyRoute]);

  // Update Turn Cues on map
  useEffect(() => {
    if (!turnMarkersGroupRef.current) return;
    turnMarkersGroupRef.current.clearLayers();

    turnCues.forEach(cue => {
      const turnIcon = L.divIcon({
        className: 'turn-marker-icon',
        html: `
          <div style="background:var(--accent);color:white;padding:2px 4px;border-radius:4px;border:1.5px solid var(--surface);font-weight:900;font-size:10px;white-space:nowrap;box-shadow:0 2px 4px rgba(0,0,0,0.4);">
            ${cue.turnType.includes('left') ? '↰' : cue.turnType.includes('right') ? '↱' : '⮑'} ${cue.description}
          </div>
        `,
        iconSize: [60, 20],
        iconAnchor: [30, 24],
      });

      L.marker([cue.lat, cue.lon], { icon: turnIcon }).addTo(turnMarkersGroupRef.current!);
    });
  }, [turnCues]);

  // Update Waypoints on map
  useEffect(() => {
    if (!waypointsGroupRef.current) return;
    waypointsGroupRef.current.clearLayers();

    if (!trail.waypoints || trail.waypoints.length === 0) return;

    trail.waypoints.forEach((wpt, index) => {
      const wptIcon = L.divIcon({
        className: 'custom-waypoint-pin',
        html: `
          <div style="display:flex;flex-direction:column;align-items:center;cursor:pointer;">
            <div style="
              background:var(--info);
              color:white;
              width:24px;
              height:24px;
              border-radius:50% 50% 50% 0;
              transform:rotate(-45deg);
              display:flex;
              align-items:center;
              justify-content:center;
              border:2px solid var(--surface);
              box-shadow:0 3px 6px rgba(0,0,0,0.5);
            ">
              <div style="transform:rotate(45deg);font-size:11px;line-height:1;">
                📍
              </div>
            </div>
          </div>
        `,
        iconSize: [24, 24],
        iconAnchor: [12, 24],
        popupAnchor: [0, -26],
      });

      const marker = L.marker([wpt.lat, wpt.lon], {
        icon: wptIcon,
        zIndexOffset: 600,
      }).addTo(waypointsGroupRef.current!);

      const eleText = wpt.ele !== undefined ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">Elevation: ${formatElevation(wpt.ele, units)}</div>` : '';
      const descText = wpt.desc ? `<div style="font-size:11px;color:var(--text);margin-top:4px;line-height:1.3;">${wpt.desc}</div>` : '';

      marker.bindPopup(`
        <div style="font-family:var(--font-body);padding:3px 4px;min-width:120px;">
          <div style="font-weight:800;font-size:12px;color:var(--text);">${wpt.name || `Waypoint ${index + 1}`}</div>
          ${eleText}
          ${descText}
        </div>
      `);

      marker.bindTooltip(wpt.name || `Waypoint ${index + 1}`, {
        direction: 'top',
        offset: [0, -24],
      });
    });
  }, [trail.id, trail.waypoints, units]);

  // Update User Position & Heading
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    if (!userPosition) {
      if (userMarkerRef.current) {
        userMarkerRef.current.setOpacity(0);
      }
      if (accuracyCircleRef.current) {
        accuracyCircleRef.current.setStyle({ opacity: 0, fillOpacity: 0 });
      }
      if (projectionLineRef.current) {
        projectionLineRef.current.setStyle({ opacity: 0 });
      }
      return;
    }

    if (userMarkerRef.current) {
      userMarkerRef.current.setOpacity(1);
    }
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setStyle({ opacity: 1, fillOpacity: 0.15 });
    }
    if (projectionLineRef.current) {
      projectionLineRef.current.setStyle({ opacity: 0.9 });
    }

    const latLng: [number, number] = [userPosition.lat, userPosition.lon];

    // Update marker position
    if (userMarkerRef.current) {
      userMarkerRef.current.setLatLng(latLng);

      // Update orientation heading pointer HTML
      const headingDeg = heading || 0;
      const markerHtml = `
        <div id="user-live-dot-wrapper" style="position:relative;width:34px;height:34px;display:flex;align-items:center;justify-content:center;">
          <!-- Orientation Cone -->
          <div style="position:absolute;width:34px;height:34px;transform:rotate(${headingDeg}deg);display:flex;justify-content:center;pointer-events:none;">
            <div style="width:0;height:0;border-left:7px solid transparent;border-right:7px solid transparent;border-bottom:12px solid var(--info);margin-top:-6px;"></div>
          </div>
          <!-- Pulsing Radar Ring -->
          <div style="position:absolute;width:30px;height:30px;border-radius:50%;background:var(--info);opacity:0.3;animation:pulse 2s infinite;"></div>
          <!-- Core Dot -->
          <div style="position:absolute;width:18px;height:18px;border-radius:50%;background:var(--info);border:3px solid var(--surface);box-shadow:0 2px 8px rgba(0,0,0,0.6);"></div>
        </div>
      `;
      userMarkerRef.current.setIcon(
        L.divIcon({
          className: 'user-live-marker',
          html: markerHtml,
          iconSize: [34, 34],
          iconAnchor: [17, 17],
        })
      );
    }

    // Update Accuracy Circle
    if (accuracyCircleRef.current) {
      accuracyCircleRef.current.setLatLng(latLng);
      accuracyCircleRef.current.setRadius(Math.max(5, userPosition.accuracy || 10));
    }

    // Update Target lookahead marker
    if (targetMarkerRef.current && targetPoint) {
      targetMarkerRef.current.setLatLng([targetPoint.lat, targetPoint.lon]);
    }

    // Update Projection guidance line (connecting user to projected nearest point)
    if (projectionLineRef.current && projectedPosition) {
      const projLatLng: [number, number] = [
        projectedPosition.point.lat,
        projectedPosition.point.lon,
      ];
      projectionLineRef.current.setLatLngs([latLng, projLatLng]);
    }

    // Follow Me: keep centered on user
    if (followMe) {
      mapInstanceRef.current.panTo(latLng, { animate: true, duration: 0.5 });
    }
  }, [userPosition, projectedPosition, targetPoint, heading, followMe]);

  // Handle Zoom In / Out / Fit
  const handleZoomIn = () => {
    mapInstanceRef.current?.zoomIn();
  };

  const handleZoomOut = () => {
    mapInstanceRef.current?.zoomOut();
  };

  const handleFitTrail = () => {
    if (mapInstanceRef.current && trail.points.length > 0) {
      const latLngs = trail.points.map(p => [p.lat, p.lon] as [number, number]);
      mapInstanceRef.current.fitBounds(L.latLngBounds(latLngs), { padding: [50, 50] });
    }
  };

  return (
    <div className="relative w-full h-full min-h-[280px] select-none">
      {/* Map Element */}
      <div
        id="trail-leaflet-map"
        ref={mapContainerRef}
        className="w-full h-full"
      />

      {/* Map Control Overlays */}
      <div className="absolute top-3 right-3 z-[400] flex flex-col gap-1.5">
        {/* Follow Me Button */}
        <button
          id="follow-me-toggle-btn"
          onClick={onToggleFollowMe}
          className="w-8 h-8 rounded-[var(--radius-sm)] font-bold shadow-md border transition active:scale-90 flex items-center justify-center"
          style={
            followMe
              ? { background: 'var(--info)', color: '#fff', borderColor: 'var(--info)' }
              : { background: 'var(--surface)', color: 'var(--text)', borderColor: 'var(--border-color)' }
          }
          title={followMe ? 'Following your location (tap to pause)' : 'Follow my location'}
          aria-label={followMe ? 'Disable follow me' : 'Enable follow me'}
        >
          <Crosshair className="w-4 h-4" />
        </button>

        {/* Fit Trail Bounds */}
        <button
          id="fit-trail-bounds-btn"
          onClick={handleFitTrail}
          className="w-8 h-8 rounded-[var(--radius-sm)] shadow-md border transition active:scale-90 flex items-center justify-center bg-[var(--surface)] text-[var(--text)] border-[var(--border-color)] hover:opacity-90"
          title="Fit whole trail in view"
          aria-label="Fit whole trail to view"
        >
          <Maximize2 className="w-3.5 h-3.5" />
        </button>

        {/* Toggle My Route Button */}
        <button
          id="toggle-my-route-btn"
          onClick={() => setShowMyRoute(prev => !prev)}
          className="w-8 h-8 rounded-[var(--radius-sm)] shadow-md border transition active:scale-90 flex items-center justify-center"
          style={
            showMyRoute
              ? { background: 'var(--accent)', color: '#fff', borderColor: 'var(--accent)' }
              : { background: 'var(--surface)', color: 'var(--text-secondary)', borderColor: 'var(--border-color)' }
          }
          title={showMyRoute ? 'Hide my route' : 'Show my route'}
          aria-label={showMyRoute ? 'Hide my route' : 'Show my route'}
        >
          <Route className="w-4 h-4" />
        </button>

        {/* Zoom Controls */}
        <div
          className="w-8 flex flex-col rounded-[var(--radius-sm)] overflow-hidden shadow-md border bg-[var(--surface)] border-[var(--border-color)]"
        >
          <button
            id="map-zoom-in-btn"
            onClick={handleZoomIn}
            className="w-8 h-7.5 hover:opacity-70 active:scale-90 transition flex items-center justify-center"
            style={{ borderBottom: '1px solid var(--border-color)' }}
            title="Zoom in"
            aria-label="Zoom in"
          >
            <ZoomIn className="w-3.5 h-3.5 text-[var(--text)]" />
          </button>
          <button
            id="map-zoom-out-btn"
            onClick={handleZoomOut}
            className="w-8 h-7.5 hover:opacity-70 active:scale-90 transition flex items-center justify-center"
            title="Zoom out"
            aria-label="Zoom out"
          >
            <ZoomOut className="w-3.5 h-3.5 text-[var(--text)]" />
          </button>
        </div>
      </div>
    </div>
  );
};
