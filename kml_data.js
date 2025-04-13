/* kml_data.js */

// (1) Color scales used for speed, acceleration, time difference, lost time.
const colorScales = {
  speed: [
    { value: 0.0, color: Cesium.Color.RED },
    { value: 0.1, color: Cesium.Color.fromCssColorString('#FF3300') },
    { value: 0.2, color: Cesium.Color.fromCssColorString('#FF6600') },
    { value: 0.3, color: Cesium.Color.fromCssColorString('#FF9900') },
    { value: 0.4, color: Cesium.Color.YELLOW },
    { value: 0.5, color: Cesium.Color.fromCssColorString('#CCFF00') },
    { value: 0.6, color: Cesium.Color.fromCssColorString('#99FF00') },
    { value: 0.7, color: Cesium.Color.fromCssColorString('#66FF00') },
    { value: 0.8, color: Cesium.Color.fromCssColorString('#33FF00') },
    { value: 0.9, color: Cesium.Color.fromCssColorString('#00FF00') },
    { value: 1.0, color: Cesium.Color.GREEN },
  ],
  acceleration: [
    { value: 0.0, color: Cesium.Color.RED },
    { value: 0.1, color: Cesium.Color.fromCssColorString('#FF3300') },
    { value: 0.2, color: Cesium.Color.fromCssColorString('#FF6600') },
    { value: 0.3, color: Cesium.Color.fromCssColorString('#FF9900') },
    { value: 0.4, color: Cesium.Color.fromCssColorString('#FFCC00') },
    { value: 0.5, color: Cesium.Color.WHITE },
    { value: 0.6, color: Cesium.Color.fromCssColorString('#CCFFCC') },
    { value: 0.7, color: Cesium.Color.fromCssColorString('#99FF99') },
    { value: 0.8, color: Cesium.Color.fromCssColorString('#66FF66') },
    { value: 0.9, color: Cesium.Color.fromCssColorString('#33FF33') },
    { value: 1.0, color: Cesium.Color.GREEN },
  ],
  timeDifference: [
    { value: 0.0, color: Cesium.Color.WHITE },
    { value: 0.1, color: Cesium.Color.fromCssColorString('#FFEEEE') },
    { value: 0.2, color: Cesium.Color.fromCssColorString('#FFDDDD') },
    { value: 0.3, color: Cesium.Color.fromCssColorString('#FFCCCC') },
    { value: 0.4, color: Cesium.Color.fromCssColorString('#FFBBBB') },
    { value: 0.5, color: Cesium.Color.fromCssColorString('#FFAAAA') },
    { value: 0.6, color: Cesium.Color.fromCssColorString('#FF8888') },
    { value: 0.7, color: Cesium.Color.fromCssColorString('#FF6666') },
    { value: 0.8, color: Cesium.Color.fromCssColorString('#FF4444') },
    { value: 0.9, color: Cesium.Color.fromCssColorString('#FF2222') },
    { value: 1.0, color: Cesium.Color.RED },
  ],
  lostTime: [
    { value: 0.0, color: Cesium.Color.fromCssColorString('#00AA00') }, // Gains
    { value: 0.1, color: Cesium.Color.fromCssColorString('#22CC22') },
    { value: 0.2, color: Cesium.Color.fromCssColorString('#44DD44') },
    { value: 0.3, color: Cesium.Color.fromCssColorString('#88EEAA') },
    { value: 0.4, color: Cesium.Color.fromCssColorString('#CCFFCC') },
    { value: 0.5, color: Cesium.Color.WHITE }, // Neutral
    { value: 0.6, color: Cesium.Color.fromCssColorString('#FFDDDD') },
    { value: 0.7, color: Cesium.Color.fromCssColorString('#FFBBBB') },
    { value: 0.8, color: Cesium.Color.fromCssColorString('#FF8888') },
    { value: 0.9, color: Cesium.Color.fromCssColorString('#FF4444') },
    { value: 1.0, color: Cesium.Color.fromCssColorString('#CC0000') }, // Loses
  ],
};

// (2) Simple color interpolation helper:
function interpolateColor(scale, val) {
  val = Math.max(0, Math.min(1, val));
  if (scale.length === 1) {
    return scale[0].color.clone();
  }
  let i = 0;
  for (; i < scale.length - 1; i++) {
    if (val >= scale[i].value && val <= scale[i + 1].value) {
      break;
    }
  }
  const cLo = scale[i].color;
  const cHi = scale[i + 1].color;
  const vLo = scale[i].value;
  const vHi = scale[i + 1].value;
  const rng = vHi - vLo;
  const frac = rng !== 0 ? (val - vLo) / rng : 0;
  return Cesium.Color.lerp(cLo, cHi, frac, new Cesium.Color());
}

// (3) KMLData class
class KMLData {
  constructor(kmlContent, fileName) {
    this.fileName = fileName;
    this.coordinates = [];
    this.timestamps = [];
    this.speeds = [];
    this.accelerations = [];
    this.name = fileName;
    this.color = Cesium.Color.fromRandom({ alpha: 1.0 });
    this.startPoint = null;
    this.endPoint = null;
    this.marker = null;
    this.syncedTimestamps = [];
    this.visible = true;
    this.segmentEntities = [];
    this.cumulativeDistances = [];
    this.totalDistance = 0;
    this.isInterpolated = false;
    this.originalPointCount = 0; // Store original point count for reference
    this.originalCoordinates = []; // Store original coordinates for elevation adjustments
    this.originalTimestamps = []; // Store original timestamps for elevation adjustments
    this.elevationOffset = 0; // Store current elevation offset

    // Parse the KML text
    this.parseKML(kmlContent);
    // Compute speeds + accelerations
    this.calculateSpeedsAndAccelerations();
    // Store original point count
    this.originalPointCount = this.coordinates.length;
    
    // Store original coordinates and timestamps for elevation adjustments
    this.storeOriginalData();
  }
  
  // Store original data for elevation adjustments
  storeOriginalData() {
    // Deep copy coordinates
    this.originalCoordinates = this.coordinates.map(coord => [...coord]);
    
    // Deep copy timestamps if they exist
    if (this.timestamps && this.timestamps.length > 0) {
      this.originalTimestamps = this.timestamps.map(ts => ({
        time: new Date(ts.time),
        coord: [...ts.coord]
      }));
    }
  }

  parseKML(kmlContent) {
    const nameMatch = kmlContent.match(/<n>(.*?)<\/name>/);
    if (nameMatch) {
      this.name = nameMatch[1];
    }
    const timePattern = /<TimeSpan>\s*<begin>(.*?)<\/begin>.*?<coordinates>(.*?)<\/coordinates>/gs;
    let match;
    while ((match = timePattern.exec(kmlContent)) !== null) {
      const begin = match[1];
      const coordStr = match[2].trim();
      const parts = coordStr.split(',');
      if (parts.length >= 2) {
        const lon = parseFloat(parts[0]);
        const lat = parseFloat(parts[1]);
        const alt = parts.length > 2 ? parseFloat(parts[2]) : 0;
        const t = new Date(begin);
        if (!isNaN(t.getTime())) {
          this.timestamps.push({ time: t, coord: [lon, lat, alt] });
        }
      }
    }
    this.timestamps.sort((a, b) => a.time - b.time);

    // fallback if no TimeSpan found
    if (this.timestamps.length === 0) {
      const lsMatch = kmlContent.match(/<LineString>.*?<coordinates>(.*?)<\/coordinates>/s);
      if (lsMatch) {
        const lines = lsMatch[1].trim().split(/\s+/);
        for (const l of lines) {
          const parts = l.split(',');
          if (parts.length >= 2) {
            const lon = parseFloat(parts[0]);
            const lat = parseFloat(parts[1]);
            const alt = parts.length > 2 ? parseFloat(parts[2]) : 0;
            this.coordinates.push([lon, lat, alt]);
          }
        }
      }
    } else {
      this.coordinates = this.timestamps.map(ts => ts.coord);
    }
  }

  calculateSpeedsAndAccelerations() {
    if (this.timestamps.length < 2) return;
    // Speeds
    for (let i = 1; i < this.timestamps.length; i++) {
      const dt = (this.timestamps[i].time - this.timestamps[i - 1].time) / 1000;
      if (dt > 0) {
        const p1 = this.timestamps[i - 1].coord;
        const p2 = this.timestamps[i].coord;
        const latRad = ((p1[1] + p2[1]) / 2) * Math.PI / 180;
        const dx = (p2[0] - p1[0]) * 111320 * Math.cos(latRad);
        const dy = (p2[1] - p1[1]) * 110540;
        const dz = (p2[2] - p1[2]);
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const sp = dist / dt;
        this.speeds.push(sp);
      } else {
        // fallback
        this.speeds.push(
          this.speeds.length > 0 ? this.speeds[this.speeds.length - 1] : 0
        );
      }
    }
    if (this.speeds.length > 0) {
      this.speeds.unshift(this.speeds[0]);
    } else {
      this.speeds = new Array(this.timestamps.length).fill(0);
    }

    // Accelerations
    for (let i = 1; i < this.speeds.length; i++) {
      const dt = (this.timestamps[i].time - this.timestamps[i - 1].time) / 1000;
      if (dt > 0) {
        const accel = (this.speeds[i] - this.speeds[i - 1]) / dt;
        this.accelerations.push(accel);
      } else {
        this.accelerations.push(
          this.accelerations.length > 0
            ? this.accelerations[this.accelerations.length - 1]
            : 0
        );
      }
    }
    if (this.accelerations.length > 0) {
      this.accelerations.unshift(this.accelerations[0]);
    } else {
      this.accelerations = new Array(this.timestamps.length).fill(0);
    }
  }

  // Interpolate data points
  interpolateData() {
    if (this.isInterpolated) {
      return false; // Already interpolated
    }

    if (this.timestamps.length < 2) {
      return false; // Not enough points to interpolate
    }

    const newTimestamps = [];
    const newCoordinates = [];
    const newSpeeds = [];
    const newAccelerations = [];

    // Add the first point as is
    newTimestamps.push(this.timestamps[0]);
    newCoordinates.push(this.coordinates[0]);
    newSpeeds.push(this.speeds[0]);
    newAccelerations.push(this.accelerations[0]);

    // For each pair of consecutive points, add 5 interpolated points between them
    for (let i = 0; i < this.timestamps.length - 1; i++) {
      const startPoint = this.timestamps[i];
      const endPoint = this.timestamps[i + 1];
      
      const startCoord = this.coordinates[i];
      const endCoord = this.coordinates[i + 1];
      
      const startSpeed = this.speeds[i];
      const endSpeed = this.speeds[i + 1];
      
      const startAccel = this.accelerations[i];
      const endAccel = this.accelerations[i + 1];
      
      const timeDiff = endPoint.time - startPoint.time;
      
      // Create 5 interpolated points
      for (let j = 1; j <= 5; j++) {
        const fraction = j / 6; // Divide the segment into 6 parts (5 new points)
        
        // Interpolate time
        const newTime = new Date(startPoint.time.getTime() + timeDiff * fraction);
        
        // Interpolate coordinates (linear interpolation)
        const newLon = startCoord[0] + (endCoord[0] - startCoord[0]) * fraction;
        const newLat = startCoord[1] + (endCoord[1] - startCoord[1]) * fraction;
        const newAlt = startCoord[2] + (endCoord[2] - startCoord[2]) * fraction;
        
        // Interpolate speed and acceleration
        const newSpeed = startSpeed + (endSpeed - startSpeed) * fraction;
        const newAccel = startAccel + (endAccel - startAccel) * fraction;
        
        // Add the interpolated point
        const newCoord = [newLon, newLat, newAlt];
        newTimestamps.push({ time: newTime, coord: newCoord });
        newCoordinates.push(newCoord);
        newSpeeds.push(newSpeed);
        newAccelerations.push(newAccel);
      }
      
      // Add the end point
      if (i === this.timestamps.length - 2) {
        newTimestamps.push(endPoint);
        newCoordinates.push(endCoord);
        newSpeeds.push(endSpeed);
        newAccelerations.push(endAccel);
      }
    }
    
    // Replace the original data with the interpolated data
    this.timestamps = newTimestamps;
    this.coordinates = newCoordinates;
    this.speeds = newSpeeds;
    this.accelerations = newAccelerations;
    this.isInterpolated = true;
    
    // Clear synced timestamps - they will be recalculated when needed
    this.syncedTimestamps = [];
    this.cumulativeDistances = [];
    
    return true;
  }

  getSpeedInUnits(m_s, units) {
    return units === 'mph' ? m_s * 2.23694 : m_s * 3.6;
  }
  getSpeedRange(units) {
    if (!this.speeds.length) return { min: 0, max: 30 };
    const arr = this.speeds.map(s => this.getSpeedInUnits(s, units));
    return { min: Math.min(...arr), max: Math.max(...arr) };
  }
  getAccelerationRange() {
    if (!this.accelerations.length) return { min: -5, max: 5 };
    return {
      min: Math.min(...this.accelerations),
      max: Math.max(...this.accelerations),
    };
  }

  findClosestPoint(cart3) {
    if (!this.coordinates.length) return -1;
    const carto = Cesium.Cartographic.fromCartesian(cart3);
    const lon = Cesium.Math.toDegrees(carto.longitude);
    const lat = Cesium.Math.toDegrees(carto.latitude);
    const alt = carto.height;
    let minDist = Infinity,
      idx = -1;
    for (let i = 0; i < this.coordinates.length; i++) {
      const c = this.coordinates[i];
      const latRad = ((lat + c[1]) / 2) * Math.PI / 180;
      const dx = (lon - c[0]) * 111320 * Math.cos(latRad);
      const dy = (lat - c[1]) * 110540;
      const dz = alt - c[2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (dist < minDist) {
        minDist = dist;
        idx = i;
      }
    }
    return idx;
  }

  // Used when placing flags to find a "better" local point.
  findOptimalPointForAnimation(initialIndex) {
    if (this.timestamps.length < 2) return initialIndex;
    let bestIndex = initialIndex;
    let bestScore = -Infinity;
    const searchRadius = Math.min(20, Math.floor(this.timestamps.length / 4));
    const startIdx = Math.max(0, initialIndex - searchRadius);
    const endIdx = Math.min(this.timestamps.length - 1, initialIndex + searchRadius);

    for (let i = startIdx; i <= endIdx; i++) {
      let score = 0;
      // Factor 1: prefer points with timestamps
      if (this.timestamps[i] && this.timestamps[i].time) {
        score += 100;
      }
      // Factor 2: prefer non-zero speeds
      if (this.speeds[i] && this.speeds[i] > 0) {
        score += 50;
      }
      // Factor 3: prefer a position not at absolute edges
      const positionFactor = 1 - Math.abs(i / (this.timestamps.length - 1) - 0.1);
      score += 30 * positionFactor;
      // Factor 4: proximity to the initial index
      const proximityFactor = 1 - Math.abs(i - initialIndex) / searchRadius;
      score += 20 * proximityFactor;

      if (score > bestScore) {
        bestScore = score;
        bestIndex = i;
      }
    }
    return bestIndex;
  }

  createSyncedTimestamps(startIndex, finishIndex, globalStart, globalEnd) {
    this.syncedTimestamps = [];
    if (
      startIndex < 0 ||
      finishIndex < 0 ||
      startIndex >= this.timestamps.length ||
      finishIndex >= this.timestamps.length ||
      globalEnd <= globalStart
    ) {
      // fallback: copy original
      for (let i = 0; i < this.timestamps.length; i++) {
        this.syncedTimestamps.push({
          time: this.timestamps[i].time,
          coord: this.timestamps[i].coord,
        });
      }
      return;
    }
    const realStart = this.timestamps[startIndex].time;
    const realEnd = this.timestamps[finishIndex].time;
    const realSpan = realEnd - realStart;
    const globalSpan = globalEnd - globalStart;

    for (let i = 0; i < this.timestamps.length; i++) {
      const tVal = this.timestamps[i].time;
      let frac = 0;
      if (realSpan > 0) {
        frac = (tVal - realStart) / realSpan;
      }
      frac = Math.max(0, Math.min(1, frac));
      const scaledTime = new Date(globalStart.getTime() + frac * globalSpan);
      this.syncedTimestamps.push({
        time: scaledTime,
        coord: this.timestamps[i].coord,
      });
    }
    // Removed call to computeCumulativeDistances as requested
  }

  computeCumulativeDistances() {
    this.cumulativeDistances = [];
    this.totalDistance = 0;
    if (this.syncedTimestamps.length < 2) {
      this.cumulativeDistances = new Array(this.syncedTimestamps.length).fill(0);
      return;
    }
    let distSoFar = 0;
    this.cumulativeDistances.push(0);
    for (let i = 1; i < this.syncedTimestamps.length; i++) {
      const prev = this.syncedTimestamps[i - 1].coord;
      const cur = this.syncedTimestamps[i].coord;
      const latRad = ((prev[1] + cur[1]) / 2) * Math.PI / 180;
      const dx = (cur[0] - prev[0]) * 111320 * Math.cos(latRad);
      const dy = (cur[1] - prev[1]) * 110540;
      const dz = cur[2] - prev[2];
      const segmentDist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      distSoFar += segmentDist;
      this.cumulativeDistances.push(distSoFar);
    }
    this.totalDistance = distSoFar;
  }

  toggleVisibility() {
    this.visible = !this.visible;
    for (const e of this.segmentEntities) {
      e.show = this.visible;
    }
    if (this.startPoint) this.startPoint.show = this.visible;
    if (this.endPoint) this.endPoint.show = this.visible;
    if (this.marker) this.marker.show = this.visible;
  }

  removeSegmentEntities() {
    if (typeof viewer !== 'undefined') {
      // We assume `viewer` is a global or a shared reference
      for (const e of this.segmentEntities) {
        viewer.entities.remove(e);
      }
    }
    this.segmentEntities = [];
  }
}

// (4) Helper to create polylines for speed/acceleration modes
function createColoredSegments(kd, values, range, colorScale, continuous = true) {
  kd.removeSegmentEntities();
  if (!kd.coordinates.length || !values.length) return;

  // Normalize - use standard normalization (no inversion)
  // This ensures consistency with the legend which is now properly displayed
  const normVals = values.map(v => {
    const nv = (v - range.min) / (range.max - range.min);
    return Math.max(0, Math.min(1, nv));
  });

  if (continuous) {
    // continuous coloring
    for (let i = 0; i < kd.coordinates.length - 1; i++) {
      const c1 = kd.coordinates[i];
      const c2 = kd.coordinates[i + 1];
      const v1 = normVals[i];
      const v2 = normVals[i + 1];
      const avgVal = (v1 + v2) / 2;
      const color = interpolateColor(colorScale, avgVal);
      const ent = viewer.entities.add({
        polyline: {
          positions: [
            Cesium.Cartesian3.fromDegrees(c1[0], c1[1], c1[2]),
            Cesium.Cartesian3.fromDegrees(c2[0], c2[1], c2[2]),
          ],
          width: 5,
          material: color,
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
          followSurface: false,
        },
      });
      kd.segmentEntities.push(ent);
    }
  } else {
    // stepped
    const segCount = colorScale.length - 1;
    const segSize = 1 / segCount;
    if (normVals.length <= 1) {
      // single segment fallback
      if (kd.coordinates.length > 1) {
        const positions = kd.coordinates.map(c =>
          Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2])
        );
        const ent = viewer.entities.add({
          polyline: {
            positions,
            width: 5,
            material: colorScale[0].color,
            clampToGround: false,
            arcType: Cesium.ArcType.NONE,
            followSurface: false,
          },
        });
        kd.segmentEntities.push(ent);
      }
    } else {
      let curSeg = Math.min(Math.floor(normVals[0] / segSize), segCount - 1);
      let segStart = 0;
      for (let i = 1; i < normVals.length; i++) {
        const s = Math.min(Math.floor(normVals[i] / segSize), segCount - 1);
        if (s !== curSeg || i === normVals.length - 1) {
          if (segStart < i) {
            const positions = [];
            for (let j = segStart; j <= i; j++) {
              const c = kd.coordinates[j];
              positions.push(Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2]));
            }
            if (positions.length >= 2) {
              const ent = viewer.entities.add({
                polyline: {
                  positions,
                  width: 5,
                  material: colorScale[curSeg].color,
                  clampToGround: false,
                  arcType: Cesium.ArcType.NONE,
                  followSurface: false,
                },
              });
              kd.segmentEntities.push(ent);
            }
          }
          curSeg = s;
          segStart = i;
        }
      }
    }
  }
}

// Function to interpolate all loaded KML data
function interpolateAllKmlData() {
  if (typeof kmlDataList === 'undefined' || !kmlDataList.length) {
    console.error("No KML data available to interpolate");
    return false;
  }
  
  let interpolatedCount = 0;
  
  try {
    // Interpolate all tracks
    for (const kd of kmlDataList) {
      if (!kd.isInterpolated) {
        if (kd.interpolateData()) {
          interpolatedCount++;
        }
      }
    }
  } catch (error) {
    console.error("Error during interpolation:", error);
    return false;
  }
  
  return interpolatedCount > 0;
}
