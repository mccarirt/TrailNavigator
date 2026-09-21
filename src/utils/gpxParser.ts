import { GeoPoint, Trail, Waypoint, BreadcrumbPoint } from '../types';
import { haversineDistance, precomputeTurnCues } from './geo';

/**
 * Computes elevation gain and loss on a 3-point moving average with a 3 m threshold.
 */
export function computeElevationGainLoss(
  segments: GeoPoint[][],
  thresholdMeters: number = 3.0
): { gain: number; loss: number } {
  let totalGain = 0;
  let totalLoss = 0;

  for (const seg of segments) {
    const rawElevations: number[] = [];
    for (const pt of seg) {
      if (pt.ele !== undefined && !isNaN(pt.ele)) {
        rawElevations.push(pt.ele);
      }
    }

    const n = rawElevations.length;
    if (n < 2) continue;

    // 3-point moving average smoothing
    const smoothed: number[] = new Array(n);
    if (n === 2) {
      smoothed[0] = rawElevations[0];
      smoothed[1] = rawElevations[1];
    } else {
      smoothed[0] = (rawElevations[0] * 2 + rawElevations[1]) / 3;
      for (let i = 1; i < n - 1; i++) {
        smoothed[i] = (rawElevations[i - 1] + rawElevations[i] + rawElevations[i + 1]) / 3;
      }
      smoothed[n - 1] = (rawElevations[n - 2] + rawElevations[n - 1] * 2) / 3;
    }

    // 3 m threshold deadband accumulation
    let refEle = smoothed[0];
    for (let i = 1; i < n; i++) {
      const diff = smoothed[i] - refEle;
      if (diff >= thresholdMeters) {
        totalGain += diff;
        refEle = smoothed[i];
      } else if (diff <= -thresholdMeters) {
        totalLoss += Math.abs(diff);
        refEle = smoothed[i];
      }
    }
  }

  return {
    gain: Math.round(totalGain),
    loss: Math.round(totalLoss),
  };
}

/**
 * Parses GPX XML text into a Trail structure.
 * - Handles multiple trkseg and trk without bridging gaps (new segment, jump not counted as distance)
 * - Drops points under 2 m from the previous one
 * - Computes elevation gain/loss on a 3-point moving average with a 3 m threshold
 * - Preserves ele === 0 (does not become undefined)
 * - Parses <wpt> into a new Trail.waypoints array (name, lat, lon)
 */
export function parseGpx(gpxText: string, defaultName: string = 'Unnamed Trail'): Trail {
  const parser = new DOMParser();
  const xmlDoc = parser.parseFromString(gpxText, 'application/xml');

  // Check for parse error
  const parserError = xmlDoc.querySelector('parsererror');
  if (parserError) {
    throw new Error('Invalid GPX file format: XML parsing failed.');
  }

  // Extract Trail Name
  let name = '';
  const trkName = xmlDoc.querySelector('trk > name');
  if (trkName && trkName.textContent?.trim()) {
    name = trkName.textContent.trim();
  } else {
    const gpxName = xmlDoc.querySelector('name');
    if (gpxName && gpxName.textContent?.trim()) {
      name = gpxName.textContent.trim();
    } else {
      name = defaultName.replace(/\.gpx$/i, '');
    }
  }

  // Parse Waypoints (<wpt>)
  const wptElements = Array.from(xmlDoc.querySelectorAll('wpt'));
  const waypoints: Waypoint[] = [];
  for (let i = 0; i < wptElements.length; i++) {
    const el = wptElements[i];
    const latStr = el.getAttribute('lat');
    const lonStr = el.getAttribute('lon');
    if (!latStr || !lonStr) continue;

    const lat = parseFloat(latStr);
    const lon = parseFloat(lonStr);
    if (isNaN(lat) || isNaN(lon)) continue;

    const nameEl = el.querySelector('name');
    const name = nameEl?.textContent?.trim() || `Waypoint ${i + 1}`;

    const descEl = el.querySelector('desc');
    const desc = descEl?.textContent?.trim() || undefined;

    const eleEl = el.querySelector('ele');
    let ele: number | undefined = undefined;
    if (eleEl && eleEl.textContent !== null && eleEl.textContent.trim() !== '') {
      const parsed = parseFloat(eleEl.textContent);
      if (!isNaN(parsed)) {
        ele = Math.round(parsed * 10) / 10;
      }
    }

    waypoints.push({
      name,
      lat,
      lon,
      ele,
      desc,
    });
  }

  // Extract track segments (<trk> -> <trkseg> -> <trkpt> or <rte> -> <rtept>)
  const rawSegments: Element[][] = [];

  const trkElements = Array.from(xmlDoc.querySelectorAll('trk'));
  if (trkElements.length > 0) {
    for (const trk of trkElements) {
      const trksegElements = Array.from(trk.querySelectorAll('trkseg'));
      if (trksegElements.length > 0) {
        for (const trkseg of trksegElements) {
          const pts = Array.from(trkseg.querySelectorAll('trkpt'));
          if (pts.length > 0) {
            rawSegments.push(pts);
          }
        }
      } else {
        const pts = Array.from(trk.querySelectorAll('trkpt'));
        if (pts.length > 0) {
          rawSegments.push(pts);
        }
      }
    }
  }

  // Fallback: check for routes (<rte>)
  if (rawSegments.length === 0) {
    const rteElements = Array.from(xmlDoc.querySelectorAll('rte'));
    if (rteElements.length > 0) {
      for (const rte of rteElements) {
        const pts = Array.from(rte.querySelectorAll('rtept'));
        if (pts.length > 0) {
          rawSegments.push(pts);
        }
      }
    }
  }

  // Fallback: orphan trkseg or trkpt elements
  if (rawSegments.length === 0) {
    const orphanSegs = Array.from(xmlDoc.querySelectorAll('trkseg'));
    if (orphanSegs.length > 0) {
      for (const seg of orphanSegs) {
        const pts = Array.from(seg.querySelectorAll('trkpt'));
        if (pts.length > 0) rawSegments.push(pts);
      }
    } else {
      const allTrkpt = Array.from(xmlDoc.querySelectorAll('trkpt'));
      if (allTrkpt.length > 0) {
        rawSegments.push(allTrkpt);
      } else {
        const allRtept = Array.from(xmlDoc.querySelectorAll('rtept'));
        if (allRtept.length > 0) {
          rawSegments.push(allRtept);
        }
      }
    }
  }

  const segments: GeoPoint[][] = [];
  const points: GeoPoint[] = [];
  let cumDistance = 0;
  let minLat = Infinity, maxLat = -Infinity;
  let minLon = Infinity, maxLon = -Infinity;

  for (const segElList of rawSegments) {
    const currentSegment: GeoPoint[] = [];

    for (let i = 0; i < segElList.length; i++) {
      const el = segElList[i];
      const latStr = el.getAttribute('lat');
      const lonStr = el.getAttribute('lon');
      if (!latStr || !lonStr) continue;

      const lat = parseFloat(latStr);
      const lon = parseFloat(lonStr);
      if (isNaN(lat) || isNaN(lon)) continue;

      // Fix bug where ele === 0 becomes undefined: check explicitly for non-null and not NaN
      const eleEl = el.querySelector('ele');
      let ele: number | undefined = undefined;
      if (eleEl && eleEl.textContent !== null && eleEl.textContent.trim() !== '') {
        const parsed = parseFloat(eleEl.textContent);
        if (!isNaN(parsed)) {
          ele = parsed;
        }
      }

      const timeEl = el.querySelector('time');
      const time = timeEl?.textContent?.trim() || undefined;

      // Drop points under 2 m from the previous one in this segment
      if (currentSegment.length > 0) {
        const prev = currentSegment[currentSegment.length - 1];
        const dist = haversineDistance(prev.lat, prev.lon, lat, lon);
        if (dist < 2.0) {
          continue; // Drop points under 2 m
        }
        cumDistance += dist;
      } else {
        // Start of a new segment: do NOT count the gap jump from previous segment as distance!
      }

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      const pt: GeoPoint = {
        lat,
        lon,
        ele: ele !== undefined && !isNaN(ele) ? Math.round(ele * 10) / 10 : undefined,
        time,
        cumDistance,
      };

      currentSegment.push(pt);
      points.push(pt);
    }

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }
  }

  // Include waypoints in boundary calculation
  for (const wpt of waypoints) {
    minLat = Math.min(minLat, wpt.lat);
    maxLat = Math.max(maxLat, wpt.lat);
    minLon = Math.min(minLon, wpt.lon);
    maxLon = Math.max(maxLon, wpt.lon);
  }

  if (points.length < 2) {
    throw new Error('GPX file contains insufficient coordinate points (minimum 2 required).');
  }

  const { gain: elevationGain, loss: elevationLoss } = computeElevationGainLoss(segments, 3.0);
  const turnCues = precomputeTurnCues(points);
  const isRoundTrip = detectIsRoundTrip(points);

  return {
    id: `trail-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    name,
    fileName: defaultName,
    createdAt: Date.now(),
    points,
    segments,
    waypoints: waypoints.length > 0 ? waypoints : undefined,
    totalDistance: cumDistance,
    elevationGain: elevationGain > 0 ? elevationGain : undefined,
    elevationLoss: elevationLoss > 0 ? elevationLoss : undefined,
    turnCues,
    isRoundTrip: isRoundTrip || undefined,
    bounds: {
      minLat,
      maxLat,
      minLon,
      maxLon,
    },
  };
}

/**
 * Detects if a trail is a round trip that retraces itself (e.g. out-and-back).
 * Sets trail.isRoundTrip = true if start and end are within 50 m and at least 60%
 * of second-half points lie within 20 m of a first-half point.
 */
export function detectIsRoundTrip(points: GeoPoint[]): boolean {
  if (!points || points.length < 4) return false;

  const start = points[0];
  const end = points[points.length - 1];
  const startEndDist = haversineDistance(start.lat, start.lon, end.lat, end.lon);
  if (startEndDist > 50) {
    return false;
  }

  const mid = Math.floor(points.length / 2);
  const firstHalf = points.slice(0, mid);
  const secondHalf = points.slice(mid);

  if (firstHalf.length === 0 || secondHalf.length === 0) return false;

  let closeCount = 0;
  for (const pt2 of secondHalf) {
    let matched = false;
    for (const pt1 of firstHalf) {
      // Fast rough degree check (~20m is ~0.00025 deg)
      if (
        Math.abs(pt2.lat - pt1.lat) < 0.0004 &&
        Math.abs(pt2.lon - pt1.lon) < 0.0004
      ) {
        if (haversineDistance(pt2.lat, pt2.lon, pt1.lat, pt1.lon) <= 20) {
          matched = true;
          break;
        }
      }
    }
    if (matched) {
      closeCount++;
    }
  }

  return closeCount / secondHalf.length >= 0.6;
}

/**
 * Creates sample trails so users can test immediately without an external GPX file
 */
export function generateSampleTrails(): Trail[] {
  // Sample 1: Mount Tamalpais Steep Ravine Trail (California)
  const tamalpaisCoords: [number, number, number][] = [
    [37.9042, -122.6288, 480],
    [37.9048, -122.6282, 475],
    [37.9056, -122.6272, 460],
    [37.9061, -122.6258, 442],
    [37.9069, -122.6241, 415], // turn right
    [37.9062, -122.6225, 385],
    [37.9051, -122.6212, 350], // turn sharp right
    [37.9038, -122.6216, 310],
    [37.9025, -122.6224, 275],
    [37.9012, -122.6235, 240], // turn left
    [37.8998, -122.6252, 205],
    [37.8986, -122.6271, 168],
    [37.8974, -122.6293, 130], // switchback right
    [37.8962, -122.6315, 95],
    [37.8949, -122.6338, 60],
    [37.8938, -122.6362, 35],
    [37.8929, -122.6385, 15],
    [37.8921, -122.6410, 0], // tests ele === 0 at sea level
  ];

  const tamalpaisWaypoints: Waypoint[] = [
    { name: 'Pan Toll Ranger Station', lat: 37.9042, lon: -122.6288, ele: 480, desc: 'Trailhead and parking' },
    { name: 'Pantanous Creek Bridge', lat: 37.9069, lon: -122.6241, ele: 415, desc: 'Scenic wooden bridge over redwoods' },
    { name: 'Stinson Beach Outlook', lat: 37.8921, lon: -122.6410, ele: 0, desc: 'Pacific ocean beach terminus' },
  ];

  const buildTrailFromCoords = (
    id: string,
    name: string,
    coords: [number, number, number][],
    sampleWaypoints?: Waypoint[]
  ): Trail => {
    let cum = 0;
    let minLat = Infinity, maxLat = -Infinity;
    let minLon = Infinity, maxLon = -Infinity;

    const points: GeoPoint[] = [];
    for (let i = 0; i < coords.length; i++) {
      const [lat, lon, ele] = coords[i];
      if (i > 0) {
        const prev = points[i - 1];
        const dist = haversineDistance(prev.lat, prev.lon, lat, lon);
        cum += dist;
      }
      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);

      points.push({ lat, lon, ele, cumDistance: cum });
    }

    if (sampleWaypoints) {
      for (const wpt of sampleWaypoints) {
        minLat = Math.min(minLat, wpt.lat);
        maxLat = Math.max(maxLat, wpt.lat);
        minLon = Math.min(minLon, wpt.lon);
        maxLon = Math.max(maxLon, wpt.lon);
      }
    }

    const { gain: elevationGain, loss: elevationLoss } = computeElevationGainLoss([points], 3.0);
    const isRoundTrip = detectIsRoundTrip(points);

    return {
      id,
      name,
      fileName: `${name.toLowerCase().replace(/\s+/g, '-')}.gpx`,
      createdAt: Date.now() - 3600000,
      points,
      segments: [points],
      waypoints: sampleWaypoints,
      totalDistance: cum,
      elevationGain: elevationGain > 0 ? elevationGain : undefined,
      elevationLoss: elevationLoss > 0 ? elevationLoss : undefined,
      turnCues: precomputeTurnCues(points),
      isRoundTrip: isRoundTrip || undefined,
      bounds: { minLat, maxLat, minLon, maxLon },
    };
  };

  // Sample 2: Yosemite Valley Mist Trail (Vernal & Nevada Falls)
  const yosemiteCoords: [number, number, number][] = [
    [37.7328, -119.5583, 1225],
    [37.7335, -119.5562, 1245],
    [37.7341, -119.5539, 1275],
    [37.7348, -119.5518, 1315],
    [37.7339, -119.5492, 1360], // Bridge turn left
    [37.7329, -119.5471, 1420],
    [37.7318, -119.5452, 1490], // Vernal Fall mist stairs
    [37.7312, -119.5435, 1545],
    [37.7305, -119.5412, 1570], // Emerald Pool
    [37.7292, -119.5385, 1630],
    [37.7281, -119.5358, 1720], // Nevada Fall switchback
    [37.7270, -119.5332, 1810],
  ];

  const yosemiteWaypoints: Waypoint[] = [
    { name: 'Happy Isles Shuttle Stop', lat: 37.7328, lon: -119.5583, ele: 1225, desc: 'Trailhead & water fill station' },
    { name: 'Vernal Fall Footbridge', lat: 37.7339, lon: -119.5492, ele: 1360, desc: 'Restroom and waterfall view' },
    { name: 'Emerald Pool Viewpoint', lat: 37.7305, lon: -119.5412, ele: 1570, desc: 'Above Vernal Fall' },
    { name: 'Nevada Fall Vista', lat: 37.7270, lon: -119.5332, ele: 1810, desc: 'Granite overlook' },
  ];

  // Sample 3: Out-and-Back Trail (retraces itself, isRoundTrip = true)
  const outAndBackOutbound: [number, number, number][] = [
    [37.2590, -112.9512, 1300], // Grotto Trailhead
    [37.2605, -112.9500, 1320],
    [37.2625, -112.9485, 1360],
    [37.2642, -112.9470, 1410],
    [37.2660, -112.9460, 1480],
    [37.2678, -112.9472, 1540], // Turnaround viewpoint
  ];
  // Retrace back to start
  const outAndBackInbound: [number, number, number][] = [...outAndBackOutbound].reverse().slice(1);
  const outAndBackCoords = [...outAndBackOutbound, ...outAndBackInbound];

  const outAndBackWaypoints: Waypoint[] = [
    { name: 'Grotto Trailhead', lat: 37.2590, lon: -112.9512, ele: 1300, desc: 'Start & finish trailhead' },
    { name: 'Scout Lookout', lat: 37.2678, lon: -112.9472, ele: 1540, desc: 'Midpoint turnaround vista' },
  ];

  return [
    buildTrailFromCoords('sample-tamalpais', 'Mt Tamalpais Steep Ravine Trail', tamalpaisCoords, tamalpaisWaypoints),
    buildTrailFromCoords('sample-yosemite', 'Yosemite Mist Trail', yosemiteCoords, yosemiteWaypoints),
    buildTrailFromCoords('sample-outandback', 'Zion Canyon Out-and-Back', outAndBackCoords, outAndBackWaypoints),
  ];
}

/**
 * Escapes special characters for XML.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Exports recorded breadcrumb segments into standard GPX format.
 * Includes one <trkseg> per segment, with lat, lon, and ISO timestamp.
 */
export function exportBreadcrumbsToGPX(trailName: string, segments: BreadcrumbPoint[][]): string {
  const safeName = escapeXml(trailName || 'Hike');
  const nowIso = new Date().toISOString();

  const trksegsXml = segments
    .filter(seg => seg.length > 0)
    .map(seg => {
      const ptsXml = seg
        .map(pt => {
          const timeIso = new Date(pt.timestamp).toISOString();
          return `      <trkpt lat="${pt.lat.toFixed(7)}" lon="${pt.lon.toFixed(7)}">\n        <time>${timeIso}</time>\n      </trkpt>`;
        })
        .join('\n');
      return `    <trkseg>\n${ptsXml}\n    </trkseg>`;
    })
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<gpx version="1.1" creator="TrailNavigator" xmlns="http://www.topografix.com/GPX/1/1">
  <metadata>
    <name>${safeName} - Recorded Route</name>
    <time>${nowIso}</time>
  </metadata>
  <trk>
    <name>${safeName} (Recorded)</name>
${trksegsXml}
  </trk>
</gpx>`;
}
