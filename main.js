/* main.js */

// No imports needed with direct script loading - these are now globally available
// from the included script files

//////////////////////////
// Global references
let viewer = null;
let kmlDataList = [];
let settings = {
  colorMode: 'speed',
  continuousColors: true,
  speedUnits: 'mph',
  legendMin: 0,
  legendMax: 100
};

// DOM elements
let fileInfoElement = null;
let progressBarElement = null;
let progressBarFillElement = null;
let trackTogglesElement = null;
let timelineSliderElement = null;
let startTimeLabel = null;
let endTimeLabel = null;
let currentTimeLabel = null;
let speedValueElement = null;
let speedSliderElement = null;
let unitToggleElement = null;
let unitLabelElement = null;
let legendGradientElement = null;
let legendLabelsElement = null;
let trackPopupElement = null;

// Initialize the application
document.addEventListener('DOMContentLoaded', () => {
  initializeViewer();
  setupEventListeners();
  initializeUI();
  createTrackPopup();
});

// Initialize Cesium viewer
function initializeViewer() {
  Cesium.Ion.defaultAccessToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJqdGkiOiIyOGI0NzRjZC04MWMyLTRiYmEtOTdkZS05MmM2YTNlOTkwODciLCJpZCI6MjkzMDE4LCJpYXQiOjE3NDQzMzg4Mjh9.goakCTnXpFoxeFNE0DBWyChHYW9nKrXOVPaNY5UjJAo';

  viewer = new Cesium.Viewer('cesiumContainer', {
    terrainProvider: Cesium.createWorldTerrain(),
    animation: false,
    baseLayerPicker: false,
    fullscreenButton: false,
    geocoder: false,
    homeButton: false,
    infoBox: false,
    sceneModePicker: false,
    selectionIndicator: false,
    timeline: false,
    navigationHelpButton: false,
    navigationInstructionsInitiallyVisible: false,
    scene3DOnly: true,
    creditContainer: document.createElement('div'), // Hide credits
    orderIndependentTranslucency: false, // Better performance
    contextOptions: {
      webgl: {
        alpha: true,
        antialias: true,
        preserveDrawingBuffer: true,
        failIfMajorPerformanceCaveat: false,
        depth: true,
        stencil: false
      }
    },
    sceneMode: Cesium.SceneMode.SCENE3D,
    shadows: false,
    showRenderLoopErrors: false,
    targetFrameRate: 60
  });

  viewer.scene.globe.depthTestAgainstTerrain = true;
  viewer.scene.screenSpaceCameraController.enableCollisionDetection = true;
  
  // Remove Cesium logo, watermarks, etc. (omitted for brevity)...

  // Initialize animation and flags with references
  initAnimationAndFlags({
    viewer,
    kmlDataList,
    settings,
    fileInfo: fileInfoElement,
  });
  
  // Setup track segment hover handler
  setupTrackHoverHandler();
}

// Set up event listeners for UI controls
function setupEventListeners() {
  // File controls
  document.getElementById('loadKmlBtn').addEventListener('click', handleFileLoad);
  document.getElementById('interpolateDataBtn').addEventListener('click', handleInterpolateData);
  
  // View controls
  document.getElementById('resetView').addEventListener('click', resetView);
  document.getElementById('topDownView').addEventListener('click', topDownView);
  document.getElementById('showAllBtn').addEventListener('click', showAllTracks);

  // [FIX] Ensure resetFlagsBtn calls resetAllFlags so gates fully reset
  document.getElementById('resetFlagsBtn').addEventListener('click', resetAllFlags);

  // Color mode controls
  document.getElementById('noColorRadio').addEventListener('change', updateColorMode);
  document.getElementById('speedRadio').addEventListener('change', updateColorMode);
  document.getElementById('accelRadio').addEventListener('change', updateColorMode);
  document.getElementById('timeDiffRadio').addEventListener('change', updateColorMode);
  document.getElementById('lostTimeRadio').addEventListener('change', updateColorMode);
  document.getElementById('continuousColors').addEventListener('change', updateColorMode);
  document.getElementById('unitToggle').addEventListener('change', toggleUnits);
  
  // Animation controls
  document.getElementById('playAnimation').addEventListener('click', startAnimation);
  document.getElementById('pauseAnimation').addEventListener('click', stopAnimation);
  document.getElementById('resetToSyncPoint').addEventListener('click', resetAnimation);
  document.getElementById('speedSlider').addEventListener('input', updateAnimationSpeed);
  document.getElementById('timelineSlider').addEventListener('input', updateTimelinePosition);
  
  // Flag controls
  document.getElementById('startPointIcon').addEventListener('click', () => placeFlag(true));
  document.getElementById('finishPointIcon').addEventListener('click', () => placeFlag(false));
  
  // Initialize flag drag/drop
  initFlagDragDrop();
}

// Initialize UI elements
function initializeUI() {
  fileInfoElement = document.getElementById('fileInfo');
  progressBarElement = document.getElementById('progressBar');
  progressBarFillElement = document.getElementById('progressBarFill');
  trackTogglesElement = document.getElementById('trackToggles');
  timelineSliderElement = document.getElementById('timelineSlider');
  startTimeLabel = document.getElementById('start-time-label');
  endTimeLabel = document.getElementById('end-time-label');
  currentTimeLabel = document.getElementById('current-time-label');
  speedValueElement = document.getElementById('speedValue');
  speedSliderElement = document.getElementById('speedSlider');
  unitToggleElement = document.getElementById('unitToggle');
  unitLabelElement = document.getElementById('unitLabel');
  legendGradientElement = document.getElementById('legendGradient');
  legendLabelsElement = document.getElementById('legendLabels');
  
  updateLegend();
}

// Create track popup element
function createTrackPopup() {
  const existingPopup = document.getElementById('trackPopup');
  if (existingPopup) {
    document.body.removeChild(existingPopup);
  }
  
  trackPopupElement = document.createElement('div');
  trackPopupElement.id = 'trackPopup';
  trackPopupElement.className = 'track-popup';
  
  const title = document.createElement('div');
  title.className = 'track-popup-title';
  
  const content = document.createElement('div');
  content.className = 'track-popup-content';
  
  trackPopupElement.appendChild(title);
  trackPopupElement.appendChild(content);
  
  document.body.appendChild(trackPopupElement);
}

// Setup track segment hover handler
function setupTrackHoverHandler() {
  if (!viewer) return;
  
  const handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas);
  
  let hoverTimeout = null;
  let isHovering = false;
  
  handler.setInputAction(function(movement) {
    const pickedObject = viewer.scene.pick(movement.endPosition);
    
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    
    if (!Cesium.defined(pickedObject) || !(pickedObject.id && pickedObject.id.polyline)) {
      hideTrackPopup();
      isHovering = false;
      return;
    }
    
    hoverTimeout = setTimeout(() => {
      const position = movement.endPosition;
      const cartesian = viewer.scene.pickPosition(position);
      
      if (cartesian) {
        showTrackPopupAtPosition(position, cartesian);
        isHovering = true;
      }
    }, 200);
    
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
  
  handler.setInputAction(function() {
    if (hoverTimeout) {
      clearTimeout(hoverTimeout);
      hoverTimeout = null;
    }
    hideTrackPopup();
    isHovering = false;
  }, Cesium.ScreenSpaceEventType.MOUSE_OUT);
}

// Show track popup at the specified position
function showTrackPopupAtPosition(screenPosition, cartesian) {
  if (!trackPopupElement || !cartesian) return;
  
  const cartographic = Cesium.Cartographic.fromCartesian(cartesian);
  const longitude = Cesium.Math.toDegrees(cartographic.longitude);
  const latitude = Cesium.Math.toDegrees(cartographic.latitude);
  const height = cartographic.height;
  
  const trackData = [];
  
  for (let i = 0; i < kmlDataList.length; i++) {
    const kd = kmlDataList[i];
    if (!kd.visible) continue;
    
    const closestPointIndex = kd.findClosestPoint(cartesian);
    if (closestPointIndex < 0) continue;
    
    let value = 0;
    let unit = '';
    
    if (settings.colorMode === 'speed') {
      value = kd.getSpeedInUnits(kd.speeds[closestPointIndex], settings.speedUnits);
      unit = settings.speedUnits === 'mph' ? 'mph' : 'kph';
    } else if (settings.colorMode === 'acceleration') {
      value = kd.accelerations[closestPointIndex];
      unit = 'm/s²';
    } else if (settings.colorMode === 'timeDifference' || settings.colorMode === 'lostTime') {
      let refTrackIdx = 0;
      if (typeof flagsState !== 'undefined' && flagsState.startTrackIndex >= 0 && 
          flagsState.startTrackIndex < kmlDataList.length) {
        refTrackIdx = flagsState.startTrackIndex;
      } else {
        let maxPoints = 0;
        for (let j = 0; j < kmlDataList.length; j++) {
          if (kmlDataList[j].visible && kmlDataList[j].timestamps.length > maxPoints) {
            maxPoints = kmlDataList[j].timestamps.length;
            refTrackIdx = j;
          }
        }
      }
      
      if (i === refTrackIdx) {
        value = 0;
      } else {
        const refTrack = kmlDataList[refTrackIdx];
        if (settings.colorMode === 'timeDifference') {
          if (kd.syncedTimestamps && kd.syncedTimestamps.length > closestPointIndex &&
              refTrack.syncedTimestamps && refTrack.syncedTimestamps.length > closestPointIndex) {
            const trackTime = kd.syncedTimestamps[closestPointIndex].time.getTime();
            const refTime = refTrack.syncedTimestamps[closestPointIndex].time.getTime();
            value = Math.abs((trackTime - refTime) / 1000);
          }
        } else if (settings.colorMode === 'lostTime') {
          if (track.lostTimeDerivatives && j < track.lostTimeDerivatives.length) {
			value = track.lostTimeDerivatives[j];
		  } else {
			// Fallback to absolute difference if derivatives not available
			const trackTime = pt.time.getTime();
			const refTime = refTrack.syncedTimestamps[closestIdx].time.getTime();
			value = (trackTime - refTime) / 1000;
		  }
        }
      }
      
      unit = 's';
    }
    
    let color;
    if (settings.colorMode === 'noColor') {
      color = kd.color;
    } else {
      const colorScale = colorScales[settings.colorMode];
      if (colorScale) {
        const normalizedValue = (value - settings.legendMin) / (settings.legendMax - settings.legendMin);
        const clampedValue = Math.max(0, Math.min(1, normalizedValue));
        color = interpolateColor(colorScale, clampedValue);
      } else {
        color = kd.color;
      }
    }
    
    trackData.push({
      name: kd.name || `Track ${i + 1}`,
      value: value,
      unit: unit,
      color: color
    });
  }
  
  updateTrackPopupContent(trackData, settings.colorMode);
  
  trackPopupElement.style.left = (screenPosition.x + 15) + 'px';
  trackPopupElement.style.top = (screenPosition.y + 15) + 'px';
  
  trackPopupElement.style.display = 'block';
}

// Update track popup content
function updateTrackPopupContent(trackData, colorMode) {
  if (!trackPopupElement) return;
  
  const title = trackPopupElement.querySelector('.track-popup-title');
  const content = trackPopupElement.querySelector('.track-popup-content');
  
  let titleText = 'Track Data';
  switch (colorMode) {
    case 'speed':
      titleText = `Speed (${settings.speedUnits === 'mph' ? 'MPH' : 'KPH'})`;
      break;
    case 'acceleration':
      titleText = 'Acceleration (m/s²)';
      break;
    case 'timeDifference':
      titleText = 'Time Difference (s)';
      break;
    case 'lostTime':
      titleText = 'Lost Time (s)';
      break;
    case 'noColor':
      titleText = 'Track Information';
      break;
  }
  title.textContent = titleText;
  
  content.innerHTML = '';
  
  if (trackData.length === 0) {
    const noData = document.createElement('div');
    noData.textContent = 'No track data available';
    content.appendChild(noData);
  } else {
    trackData.forEach(track => {
      const item = document.createElement('div');
      item.className = 'track-popup-item';
      
      const colorBox = document.createElement('div');
      colorBox.className = 'track-popup-color';
      colorBox.style.backgroundColor = track.color.toCssColorString();
      
      const name = document.createElement('div');
      name.className = 'track-popup-name';
      name.textContent = track.name;
      
      const value = document.createElement('div');
      value.className = 'track-popup-value';
      value.textContent = `${track.value.toFixed(2)} ${track.unit}`;
      
      item.appendChild(colorBox);
      item.appendChild(name);
      item.appendChild(value);
      
      content.appendChild(item);
    });
  }
}

// Hide track popup
function hideTrackPopup() {
  if (trackPopupElement) {
    trackPopupElement.style.display = 'none';
  }
}

// Handle file loading
function handleFileLoad() {
  const input = document.createElement('input');
  input.type = 'file';
  input.multiple = true;
  input.accept = '.kml,.kmz';
  
  input.onchange = async (e) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    
    progressBarElement.style.display = 'block';
    progressBarFillElement.style.width = '0%';
    progressBarFillElement.textContent = '0%';
    
    let loadedCount = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      fileInfoElement.textContent = `Loading ${file.name}...`;
      
      try {
        const content = await readFileContent(file);
        const kmlData = new KMLData(content, file.name);
        kmlDataList.push(kmlData);
        
        loadedCount++;
        const progress = Math.round((loadedCount / files.length) * 100);
        progressBarFillElement.style.width = `${progress}%`;
        progressBarFillElement.textContent = `${progress}%`;
        
        addTrackToggle(kmlData, kmlDataList.length - 1);
      } catch (error) {
        console.error(`Error loading ${file.name}:`, error);
        fileInfoElement.textContent = `Error loading ${file.name}`;
      }
    }
    
    if (loadedCount > 0) {
      fileInfoElement.textContent = `Loaded ${loadedCount} file(s)`;
      updateColorMode();
      showAllTracks();
    }
    
    setTimeout(() => {
      progressBarElement.style.display = 'none';
    }, 2000);
  };
  
  input.click();
}

// Handle interpolation of KML data
function handleInterpolateData() {
  if (!kmlDataList.length) {
    fileInfoElement.textContent = "No KML data loaded to interpolate";
    return;
  }
  
  fileInfoElement.textContent = "Interpolating data...";
  progressBarElement.style.display = 'block';
  progressBarFillElement.style.width = '0%';
  progressBarFillElement.textContent = '0%';
  
  setTimeout(() => {
    try {
      if (typeof stopAnimation === 'function') {
        stopAnimation();
      }
      
      resetFlags();
      
      let interpolatedCount = 0;
      const totalTracks = kmlDataList.length;
      
      for (let i = 0; i < kmlDataList.length; i++) {
        const kd = kmlDataList[i];
        if (!kd.isInterpolated) {
          if (kd.interpolateData()) {
            interpolatedCount++;
          }
        }
        
        const progress = Math.round(((i + 1) / totalTracks) * 100);
        progressBarFillElement.style.width = `${progress}%`;
        progressBarFillElement.textContent = `${progress}%`;
      }
      
      if (interpolatedCount > 0) {
        updateColorMode();
        fileInfoElement.textContent = `Interpolated ${interpolatedCount} track(s)`;
      } else {
        fileInfoElement.textContent = "All tracks already interpolated";
      }
    } catch (error) {
      console.error("Error during interpolation:", error);
      fileInfoElement.textContent = "Error during interpolation";
    }
    
    setTimeout(() => {
      progressBarElement.style.display = 'none';
    }, 2000);
  }, 100);
}

// Read file content as text
function readFileContent(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => resolve(e.target.result);
    reader.onerror = (e) => reject(e);
    reader.readAsText(file);
  });
}

// Add track toggle UI element
function addTrackToggle(kmlData, index) {
  const trackDiv = document.createElement('div');
  trackDiv.className = 'track-toggle';
  
  // Create checkbox for visibility toggle
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.className = 'track-visibility-toggle';
  checkbox.checked = kmlData.visible;
  checkbox.onchange = () => {
    kmlData.toggleVisibility();
    trackDiv.style.opacity = kmlData.visible ? '1' : '0.5';
  };
  
  const colorBox = document.createElement('div');
  colorBox.className = 'color-box';
  colorBox.style.backgroundColor = kmlData.color.toCssColorString();
  
  const nameSpan = document.createElement('span');
  nameSpan.textContent = kmlData.name || `Track ${index + 1}`;
  nameSpan.className = 'track-name';
  
  // Create elevation adjustment control
  const elevationControl = document.createElement('div');
  elevationControl.className = 'elevation-control';
  
  const elevationLabel = document.createElement('span');
  elevationLabel.textContent = 'Elev:';
  elevationLabel.className = 'elevation-label';
  
  const elevationInput = document.createElement('input');
  elevationInput.type = 'number';
  elevationInput.className = 'elevation-input';
  elevationInput.value = kmlData.elevationOffset || '0';
  elevationInput.min = '-1000';
  elevationInput.max = '1000';
  elevationInput.step = '1';
  elevationInput.title = 'Adjust track elevation (absolute value)';
  elevationInput.onchange = (e) => {
    const elevationOffset = parseFloat(e.target.value) || 0;
    adjustTrackElevation(kmlData, elevationOffset);
  };
  
  elevationControl.appendChild(elevationLabel);
  elevationControl.appendChild(elevationInput);
  
  const removeBtn = document.createElement('span');
  removeBtn.className = 'remove-track';
  removeBtn.textContent = '×';
  removeBtn.onclick = () => removeTrack(index);
  
  trackDiv.appendChild(checkbox);
  trackDiv.appendChild(colorBox);
  trackDiv.appendChild(nameSpan);
  trackDiv.appendChild(elevationControl);
  trackDiv.appendChild(removeBtn);
  
  trackTogglesElement.appendChild(trackDiv);
}

// Adjust track elevation
function adjustTrackElevation(kmlData, elevationOffset) {
  kmlData.removeSegmentEntities();
  
  kmlData.elevationOffset = elevationOffset;
  
  for (let i = 0; i < kmlData.originalCoordinates.length; i++) {
    kmlData.coordinates[i] = [
      kmlData.originalCoordinates[i][0],
      kmlData.originalCoordinates[i][1],
      kmlData.originalCoordinates[i][2] + elevationOffset
    ];
  }
  
  if (kmlData.originalTimestamps && kmlData.originalTimestamps.length > 0) {
    for (let i = 0; i < kmlData.originalTimestamps.length; i++) {
      if (i < kmlData.timestamps.length) {
        kmlData.timestamps[i].coord = [
          kmlData.originalTimestamps[i].coord[0],
          kmlData.originalTimestamps[i].coord[1],
          kmlData.originalTimestamps[i].coord[2] + elevationOffset
        ];
      }
    }
  }
  
  kmlData.syncedTimestamps = [];
  
  updateColorMode();
}

// Remove track
function removeTrack(index) {
  if (index < 0 || index >= kmlDataList.length) return;
  
  const kd = kmlDataList[index];
  kd.removeSegmentEntities();
  
  if (kd.startPoint) viewer.entities.remove(kd.startPoint);
  if (kd.endPoint) viewer.entities.remove(kd.endPoint);
  if (kd.marker) viewer.entities.remove(kd.marker);
  
  kmlDataList.splice(index, 1);
  trackTogglesElement.innerHTML = '';
  
  kmlDataList.forEach((kd, i) => {
    addTrackToggle(kd, i);
  });
  
  updateColorMode();
}

// Update color mode based on radio selection
function updateColorMode() {
  const colorMode = document.querySelector('input[name="colorMode"]:checked').value;
  const continuous = document.getElementById('continuousColors').checked;
  
  settings.colorMode = colorMode;
  settings.continuousColors = continuous;
  
  calculateMinMaxValues();
  
  for (const kd of kmlDataList) {
    kd.removeSegmentEntities();
    if (!kd.visible) continue;
  }
  
  if (colorMode === 'noColor') {
    for (const kd of kmlDataList) {
      if (!kd.visible) continue;
      
      const positions = kd.coordinates.map(c => 
        Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2])
      );
      
      const entity = viewer.entities.add({
        polyline: {
          positions,
          width: 5,
          material: kd.color,
          clampToGround: false,
          arcType: Cesium.ArcType.NONE,
          followSurface: false,
        },
      });
      
      kd.segmentEntities.push(entity);
    }
  } else if (colorMode === 'speed') {
    for (const kd of kmlDataList) {
      if (!kd.visible) continue;
      const convertedSpeeds = kd.speeds.map(speed => kd.getSpeedInUnits(speed, settings.speedUnits));
      const range = { min: settings.legendMin, max: settings.legendMax };
      createColoredSegments(kd, convertedSpeeds, range, colorScales.speed, continuous);
    }
  } else if (colorMode === 'acceleration') {
    for (const kd of kmlDataList) {
      if (!kd.visible) continue;
      const range = { min: settings.legendMin, max: settings.legendMax };
      createColoredSegments(kd, kd.accelerations, range, colorScales.acceleration, continuous);
    }
  } else if (colorMode === 'timeDifference') {
    createTimeDiffSegments(kmlDataList);
  } else if (colorMode === 'lostTime') {
    createLostTimeSegments(kmlDataList);
  }
  
  updateLegend();
}

// Calculate min/max values for the current color mode
function calculateMinMaxValues() {
  const colorMode = settings.colorMode;
  
  if (colorMode === 'speed') {
    if (!settings.hasOwnProperty('userSetLegendMin') && !settings.hasOwnProperty('userSetLegendMax')) {
      settings.legendMin = 0;
      settings.legendMax = 25;
    }
  } else if (colorMode === 'acceleration') {
    if (!settings.hasOwnProperty('userSetLegendMin') && !settings.hasOwnProperty('userSetLegendMax')) {
      settings.legendMin = -15;
      settings.legendMax = 15;
    }
  } else if (colorMode === 'timeDifference') {
    if (!settings.hasOwnProperty('userSetLegendMin') && !settings.hasOwnProperty('userSetLegendMax')) {
      settings.legendMin = 0;
      settings.legendMax = 10;
    }
  } else if (colorMode === 'lostTime') {
    if (!settings.hasOwnProperty('userSetLegendMin') && !settings.hasOwnProperty('userSetLegendMax')) {
      settings.legendMin = -3;
      settings.legendMax = 3;
    }
  }
}

// Toggle between MPH and KPH
function toggleUnits() {
  settings.speedUnits = unitToggleElement.checked ? 'kph' : 'mph';
  unitLabelElement.textContent = unitToggleElement.checked ? 'KPH' : 'MPH';
  
  if (settings.colorMode === 'speed') {
    delete settings.userSetLegendMin;
    delete settings.userSetLegendMax;
    updateColorMode();
  }
  
  updateLegend();
}

// Update the legend based on current color mode
function updateLegend() {
  legendGradientElement.innerHTML = '';
  legendLabelsElement.innerHTML = '';
  
  if (settings.colorMode === 'noColor') {
    return;
  }
  
  const scale = colorScales[settings.colorMode];
  if (!scale) return;
  
  const gradient = document.createElement('div');
  gradient.style.width = '100%';
  gradient.style.height = '100%';
  
  if (settings.continuousColors) {
    let gradientStr = 'linear-gradient(to bottom, ';
    const reversedScale = [...scale].reverse();
    reversedScale.forEach((item, i) => {
      gradientStr += `${item.color.toCssColorString()} ${(1 - item.value) * 100}%`;
      if (i < reversedScale.length - 1) gradientStr += ', ';
    });
    gradientStr += ')';
    gradient.style.background = gradientStr;
  } else {
    const segCount = scale.length - 1;
    const segHeight = 100 / segCount;
    
    for (let i = 0; i < segCount; i++) {
      const seg = document.createElement('div');
      seg.style.height = `${segHeight}%`;
      seg.style.backgroundColor = scale[scale.length - 1 - i].color.toCssColorString();
      legendGradientElement.appendChild(seg);
    }
  }
  
  if (settings.continuousColors) {
    legendGradientElement.appendChild(gradient);
  }
  
  const min = settings.legendMin;
  const max = settings.legendMax;
  const range = max - min;
  
  const labelCount = 7;
  
  for (let i = 0; i < labelCount; i++) {
    const position = i / (labelCount - 1) * 100;
    const value = max - (i / (labelCount - 1) * range);
    
    const label = document.createElement('div');
    label.className = 'legend-label';
    label.style.top = `${position}%`;
    label.style.transform = 'translateY(-50%)';
    
    if (settings.colorMode === 'speed') {
      const units = settings.speedUnits;
      label.textContent = `${value.toFixed(1)} ${units}`;
    } else if (settings.colorMode === 'acceleration') {
      label.textContent = `${value.toFixed(1)} m/s²`;
    } else if (settings.colorMode === 'timeDifference' || settings.colorMode === 'lostTime') {
      label.textContent = `${value.toFixed(1)}s`;
    }
    
    if (i === 0 || i === labelCount - 1) {
      label.style.cursor = 'pointer';
      label.title = 'Double-click to adjust value';
      
      label.addEventListener('dblclick', (e) => {
        const isTop = i === 0;
        const currentValue = isTop ? settings.legendMax : settings.legendMin;
        const newValue = prompt(
          `Enter new ${isTop ? 'maximum' : 'minimum'} value:`, 
          currentValue
        );
        
        if (newValue !== null && !isNaN(parseFloat(newValue))) {
          if (isTop) {
            settings.legendMax = parseFloat(newValue);
            settings.userSetLegendMax = true;
          } else {
            settings.legendMin = parseFloat(newValue);
            settings.userSetLegendMin = true;
          }
          updateColorMode();
        }
      });
    }
    
    legendLabelsElement.appendChild(label);
  }
}

// Create time difference segments
function createTimeDiffSegments(kmlDataList) {
  if (kmlDataList.length < 2) return;
  
  let hasSyncedTimestamps = false;
  for (const kd of kmlDataList) {
    if (kd.visible && kd.syncedTimestamps && kd.syncedTimestamps.length > 0) {
      hasSyncedTimestamps = true;
      break;
    }
  }
  
  if (!hasSyncedTimestamps) {
    if (typeof syncTracksToStart === 'function') {
      syncTracksToStart();
    } else if (typeof flagsState !== 'undefined' && flagsState.startTrackIndex >= 0) {
      if (typeof window.syncTracksToStart === 'function') {
        window.syncTracksToStart();
      }
    } else {
      for (const kd of kmlDataList) {
        if (kd.timestamps && kd.timestamps.length > 0) {
          kd.syncedTimestamps = [];
          for (let i = 0; i < kd.timestamps.length; i++) {
            kd.syncedTimestamps.push({
              time: kd.timestamps[i].time,
              coord: kd.timestamps[i].coord
            });
          }
        }
      }
    }
  }
  
  let refTrackIdx = 0;
  let maxPoints = 0;
  if (typeof flagsState !== 'undefined' && flagsState.startTrackIndex >= 0 && 
      flagsState.startTrackIndex < kmlDataList.length) {
    refTrackIdx = flagsState.startTrackIndex;
  } else {
    for (let i = 0; i < kmlDataList.length; i++) {
      if (kmlDataList[i].visible && kmlDataList[i].syncedTimestamps && 
          kmlDataList[i].syncedTimestamps.length > maxPoints) {
        maxPoints = kmlDataList[i].syncedTimestamps.length;
        refTrackIdx = i;
      }
    }
  }
  
  const refTrack = kmlDataList[refTrackIdx];
  if (!refTrack.syncedTimestamps || !refTrack.syncedTimestamps.length) return;
  
  for (let i = 0; i < kmlDataList.length; i++) {
    if (i === refTrackIdx || !kmlDataList[i].visible) continue;
    
    const track = kmlDataList[i];
    if (!track.syncedTimestamps || !track.syncedTimestamps.length) continue;
    
    const timeDiffs = [];
    
    for (let j = 0; j < track.syncedTimestamps.length; j++) {
      const pt = track.syncedTimestamps[j];
      let minDist = Infinity;
      let closestIdx = -1;
      
      for (let k = 0; k < refTrack.syncedTimestamps.length; k++) {
        const refPt = refTrack.syncedTimestamps[k];
        const latRad = ((pt.coord[1] + refPt.coord[1]) / 2) * Math.PI / 180;
        const dx = (pt.coord[0] - refPt.coord[0]) * 111320 * Math.cos(latRad);
        const dy = (pt.coord[1] - refPt.coord[1]) * 110540;
        const dz = pt.coord[2] - refPt.coord[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < minDist) {
          minDist = dist;
          closestIdx = k;
        }
      }
      
      if (closestIdx >= 0) {
        const trackTime = pt.time.getTime();
        const refTime = refTrack.syncedTimestamps[closestIdx].time.getTime();
        const timeDiff = (trackTime - refTime) / 1000;
        timeDiffs.push(Math.abs(timeDiff));
      } else {
        timeDiffs.push(0);
      }
    }
    
    const range = {
      min: settings.legendMin,
      max: settings.legendMax
    };
    createColoredSegments(track, timeDiffs, range, colorScales.timeDifference, settings.continuousColors);
  }
  
  const positions = refTrack.coordinates.map(c => 
    Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2])
  );
  
  const entity = viewer.entities.add({
    polyline: {
      positions,
      width: 5,
      material: Cesium.Color.WHITE,
      clampToGround: false,
      arcType: Cesium.ArcType.NONE,
      followSurface: false,
    },
  });
  
  refTrack.segmentEntities.push(entity);
}

// Create lost time segments
function createLostTimeSegments(kmlDataList) {
  if (kmlDataList.length < 2) return;
  
  let refTrackIdx = 0;
  let maxPoints = 0;
  
  if (typeof flagsState !== 'undefined' && flagsState.startTrackIndex >= 0 && 
      flagsState.startTrackIndex < kmlDataList.length) {
    refTrackIdx = flagsState.startTrackIndex;
  } else {
    for (let i = 0; i < kmlDataList.length; i++) {
      if (kmlDataList[i].visible && kmlDataList[i].timestamps.length > maxPoints) {
        maxPoints = kmlDataList[i].timestamps.length;
        refTrackIdx = i;
      }
    }
  }
  
  const refTrack = kmlDataList[refTrackIdx];
  
  if (!refTrack.syncedTimestamps || !refTrack.syncedTimestamps.length) {
    if (flagsState && flagsState.startTrackIndex >= 0) {
      syncTracksToStart();
    } else {
      for (const kd of kmlDataList) {
        if (kd.timestamps && kd.timestamps.length > 0) {
          kd.syncedTimestamps = [];
          for (let i = 0; i < kd.timestamps.length; i++) {
            kd.syncedTimestamps.push({
              time: kd.timestamps[i].time,
              coord: kd.timestamps[i].coord
            });
          }
        }
      }
    }
  }
  
  if (!refTrack.syncedTimestamps || !refTrack.syncedTimestamps.length) {
    console.error("Reference track missing synced timestamps");
    return;
  }
  
  for (let i = 0; i < kmlDataList.length; i++) {
    if (i === refTrackIdx || !kmlDataList[i].visible) continue;
    
    const track = kmlDataList[i];
    
    if (!track.syncedTimestamps || !track.syncedTimestamps.length) {
      continue;
    }
    
    const absoluteLostTimes = [];
    
    for (let j = 0; j < track.syncedTimestamps.length; j++) {
      const pt = track.syncedTimestamps[j];
      let minDist = Infinity;
      let closestIdx = -1;
      
      for (let k = 0; k < refTrack.syncedTimestamps.length; k++) {
        const refPt = refTrack.syncedTimestamps[k];
        const latRad = ((pt.coord[1] + refPt.coord[1]) / 2) * Math.PI / 180;
        const dx = (pt.coord[0] - refPt.coord[0]) * 111320 * Math.cos(latRad);
        const dy = (pt.coord[1] - refPt.coord[1]) * 110540;
        const dz = pt.coord[2] - refPt.coord[2];
        const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
        
        if (dist < minDist) {
          minDist = dist;
          closestIdx = k;
        }
      }
      
      if (closestIdx >= 0) {
        const trackTime = pt.time.getTime();
        const refTime = refTrack.syncedTimestamps[closestIdx].time.getTime();
        const lostTime = (trackTime - refTime) / 1000;
        absoluteLostTimes.push(lostTime);
      } else {
        absoluteLostTimes.push(0);
      }
    }
 
    // Now calculate the derivative (change in lost time between steps)
    const lostTimeDerivatives = [];
    
    // For the first point, we don't have a previous value, so use 0 (no change)
    lostTimeDerivatives.push(0);
    
    // Calculate derivatives for the rest of the points
    for (let j = 1; j < absoluteLostTimes.length; j++) {
      const currentLostTime = absoluteLostTimes[j];
      const previousLostTime = absoluteLostTimes[j-1];
      
      // Calculate the change in lost time from previous to current point
      const derivative = currentLostTime - previousLostTime;
      lostTimeDerivatives.push(derivative);
    }
	
	track.lostTimeDerivatives = lostTimeDerivatives;

    const range = {
      min: settings.legendMin,
      max: settings.legendMax
    };
    createColoredSegments(track, lostTimeDerivatives, range, colorScales.lostTime, settings.continuousColors);
  }
  
  const positions = refTrack.coordinates.map(c => 
    Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2])
  );
  
  const entity = viewer.entities.add({
    polyline: {
      positions,
      width: 5,
      material: Cesium.Color.WHITE,
      clampToGround: false,
      arcType: Cesium.ArcType.NONE,
      followSurface: false,
    },
  });
  
  refTrack.segmentEntities.push(entity);
}

// Reset view to show all tracks
function resetView() {
  if (!kmlDataList.length) return;
  
  const allPositions = [];
  for (const kd of kmlDataList) {
    if (!kd.visible) continue;
    for (const c of kd.coordinates) {
      allPositions.push(Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2]));
    }
  }
  
  if (allPositions.length) {
    viewer.camera.flyToBoundingSphere(
      Cesium.BoundingSphere.fromPoints(allPositions),
      {
        duration: 1.5,
        offset: new Cesium.HeadingPitchRange(0, -Math.PI / 4, 0),
      }
    );
  }
}

// Set top-down view
function topDownView() {
  if (!kmlDataList.length) return;
  
  const allPositions = [];
  for (const kd of kmlDataList) {
    if (!kd.visible) continue;
    for (const c of kd.coordinates) {
      allPositions.push(Cesium.Cartesian3.fromDegrees(c[0], c[1], c[2]));
    }
  }
  
  if (allPositions.length) {
    const boundingSphere = Cesium.BoundingSphere.fromPoints(allPositions);
    const center = boundingSphere.center;
    const radius = boundingSphere.radius;
    
    const cartographic = Cesium.Cartographic.fromCartesian(center);
    const surface = Cesium.Cartesian3.fromRadians(
      cartographic.longitude,
      cartographic.latitude,
      0
    );
    
    const direction = Cesium.Cartesian3.normalize(
      Cesium.Cartesian3.subtract(center, Cesium.Ellipsoid.WGS84.geocentricSurfaceNormal(surface), new Cesium.Cartesian3()),
      new Cesium.Cartesian3()
    );
    
    viewer.camera.flyTo({
      destination: Cesium.Cartesian3.add(
        surface,
        Cesium.Cartesian3.multiplyByScalar(direction, -radius * 3, new Cesium.Cartesian3()),
        new Cesium.Cartesian3()
      ),
      orientation: {
        heading: 0,
        pitch: -Math.PI / 2,
        roll: 0
      },
      duration: 1.5
    });
  }
}

// Show all tracks
function showAllTracks() {
  for (const kd of kmlDataList) {
    kd.visible = true;
  }
  
  const trackDivs = trackTogglesElement.querySelectorAll('.track-toggle');
  trackDivs.forEach(div => {
    div.style.opacity = '1';
    const checkbox = div.querySelector('.track-visibility-toggle');
    if (checkbox) {
      checkbox.checked = true;
    }
  });
  
  updateColorMode();
  resetView();
}

// Reset flags
function resetFlags() {
  console.log("main.js resetFlags called - direct implementation");
  
  if (typeof flagsState !== 'undefined') {
    if (flagsState.startFlag) {
      viewer.entities.remove(flagsState.startFlag);
      flagsState.startFlag = null;
    }
    if (flagsState.finishFlag) {
      viewer.entities.remove(flagsState.finishFlag);
      flagsState.finishFlag = null;
    }
    flagsState.startTrackIndex = -1;
    flagsState.startPointIndex = -1;
    flagsState.finishTrackIndex = -1;
    flagsState.finishPointIndex = -1;
    
    const startIcon = document.getElementById('startPointIcon');
    const finishIcon = document.getElementById('finishPointIcon');
    if (startIcon) {
      startIcon.classList.remove('flag-deployed');
      startIcon.classList.remove('flag-adjusting');
    }
    if (finishIcon) {
      finishIcon.classList.remove('flag-deployed');
      finishIcon.classList.remove('flag-adjusting');
    }

    if (flagsState.hasOwnProperty('startFlagDeployed')) {
      flagsState.startFlagDeployed = false;
    }
    if (flagsState.hasOwnProperty('finishFlagDeployed')) {
      flagsState.finishFlagDeployed = false;
    }
    
    if (flagsState.hasOwnProperty('flagPickedUp')) {
      flagsState.flagPickedUp = false;
    }
    if (flagsState.hasOwnProperty('pickedUpFlagType')) {
      flagsState.pickedUpFlagType = null;
    }
    
    if (typeof hideGhostFlag === 'function') {
      hideGhostFlag();
    }
    
    if (fileInfoElement) {
      fileInfoElement.textContent = "Flags reset";
    }
  }
}

// Update animation speed
function updateAnimationSpeed() {
  const speed = parseFloat(speedSliderElement.value);
  speedValueElement.textContent = speed.toFixed(2) + 'x';
  
  if (typeof animationState !== 'undefined') {
    animationState.speed = speed;
  }
}

// Update timeline position
function updateTimelinePosition() {
  const value = parseInt(timelineSliderElement.value);
  
  if (typeof animationState !== 'undefined' && 
      animationState.startTime && 
      animationState.endTime) {
    
    const startTime = animationState.startTime.getTime();
    const endTime = animationState.endTime.getTime();
    const range = endTime - startTime;
    
    const newTime = new Date(startTime + (range * value / 100));
    animationState.currentTime = newTime;
    
    updateAnimationMarkers();
    updateTimeDisplay();
  }
}

// Update time display
function updateTimeDisplay() {
  if (typeof animationState === 'undefined') return;
  
  if (animationState.startTime) {
    startTimeLabel.textContent = formatTime(animationState.startTime);
  }
  
  if (animationState.endTime) {
    endTimeLabel.textContent = formatTime(animationState.endTime);
  }
  
  if (animationState.currentTime) {
    currentTimeLabel.textContent = formatTime(animationState.currentTime);
    
    if (animationState.startTime && animationState.endTime) {
      const startTime = animationState.startTime.getTime();
      const endTime = animationState.endTime.getTime();
      const currentTime = animationState.currentTime.getTime();
      const range = endTime - startTime;
      
      if (range > 0) {
        const percent = ((currentTime - startTime) / range) * 100;
        timelineSliderElement.value = percent;
      }
    }
  }
}

function formatTime(date) {
  if (!date) return '00:00';
  
  const hours = date.getHours().toString().padStart(2, '0');
  const minutes = date.getMinutes().toString().padStart(2, '0');
  const seconds = date.getSeconds().toString().padStart(2, '0');
  
  return `${hours}:${minutes}:${seconds}`;
}
