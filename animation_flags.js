/* animation_flags.js */

// Global references to external objects
let viewerRef = null;
let kmlDataListRef = null;
let settingsRef = null;
let fileInfoRef = null;

// Global event handlers for proper cleanup
let globalEventHandlers = {
  mousemove: null,
  mouseup: null,
  click: null
};

// Global screen space event handler for proper cleanup
let flagPlacementHandler = null;

/**
 * Animation state - Tracks the current state of the animation playback
 */
const animationState = {
  playing: false,        // Whether animation is currently playing
  currentTime: 0,        // Current time in the animation
  startTime: 0,          // Global start time for all tracks
  endTime: 0,            // Global end time for all tracks
  speed: 1.0,            // Animation playback speed multiplier
  markers: [],           // Array of marker entities showing current position
  lastUpdateTime: 0,     // Last time the animation was updated (for delta time calculation)
};

/**
 * Flags state - Tracks the current state of start/finish flags
 */
const flagsState = {
  // Flag entities
  startFlag: null,           // Cesium entity for start flag
  finishFlag: null,          // Cesium entity for finish flag
  
  // Track indices for flags
  startTrackIndex: -1,       // Index of track where start flag is placed
  startPointIndex: -1,       // Index of point on track where start flag is placed
  finishTrackIndex: -1,      // Index of track where finish flag is placed
  finishPointIndex: -1,      // Index of point on track where finish flag is placed
  
  // Drag state
  draggingStart: false,      // Whether start flag is being dragged
  draggingFinish: false,     // Whether finish flag is being dragged
  movingPlacedFlag: false,   // Whether a placed flag is being moved
  currentMovingFlag: null,   // Reference to flag being moved
  flagAdjustmentInProgress: false,  // Whether flag adjustment is in progress
  initialFlagPosition: null,  // Initial position of flag being adjusted

  // For improved drag and drop
  isDragging: false,         // Whether drag operation is in progress
  draggedFlagElement: null,  // Element being dragged
  draggedFlagType: null,     // Type of flag being dragged ('start' or 'finish')
  mouseOffsetX: 0,           // X offset of mouse from flag center
  mouseOffsetY: 0,           // Y offset of mouse from flag center
  startFlagDeployed: false,  // Whether start flag is deployed
  finishFlagDeployed: false, // Whether finish flag is deployed

  // Prevent map movement during flag interaction
  preventMapMovement: false, // Whether to prevent map movement

  // Flag entity hit boxes for detection
  flagHitBoxes: [],          // Array of hit boxes for flag detection

  // Store original camera controller state
  originalCameraController: null, // Original camera controller state

  // Track if we're hovering over a flag
  hoveringOverFlag: false,   // Whether mouse is hovering over a flag

  // Store initial mouse position for drag operations
  initialMouseX: 0,          // Initial X position of mouse for drag
  initialMouseY: 0,          // Initial Y position of mouse for drag

  // Store initial screen position of flag for smooth movement
  initialFlagScreenPosition: null, // Initial screen position of flag
  
  // State for map-based pickup and drop
  flagPickedUp: false,       // Whether a flag is picked up
  pickedUpFlagType: null,    // Type of flag picked up ('start' or 'finish')
  
  // Ghost flag element for pickup and drop
  ghostFlagElement: null,    // Ghost flag element
  
  // Flag to track if reset was just performed
  justReset: false,          // Whether reset was just performed
  
  // Flag to track if we're in the process of resetting
  isResetting: false         // Whether we're in the process of resetting
};

/**
 * Initialize animation and flags
 * Called once from main.js to set references to external objects
 * 
 * @param {Object} options - Object containing references to external objects
 * @param {Object} options.viewer - Cesium viewer instance
 * @param {Array} options.kmlDataList - Array of KML data objects
 * @param {Object} options.settings - Settings object
 * @param {Object} options.fileInfo - File info element
 */
function initAnimationAndFlags({ viewer, kmlDataList, settings, fileInfo }) {
  // Store references to external objects
  viewerRef = viewer;
  kmlDataListRef = kmlDataList;
  settingsRef = settings;
  fileInfoRef = fileInfo;

  // Store original camera controller for later restoration
  if (viewerRef && viewerRef.scene && viewerRef.scene.screenSpaceCameraController) {
    flagsState.originalCameraController = {
      enableInputs: viewerRef.scene.screenSpaceCameraController.enableInputs
    };
  }

  // Set up map movement prevention
  setupMapMovementPrevention();
  
  // Set up flag hover detection
  setupFlagHoverDetection();
  
  // Create ghost flag element
  createGhostFlagElement();
  
  // Add CSS for flag pulse animation
  addFlagPulseCSS();
  
  // Update menu icons
  updateMenuIcons();
  
  // Force hide ghost flag initially
  hideGhostFlag();
  
  // Initialize flag placement and drag/drop
  // IMPORTANT: These should only be called ONCE at initialization
  initFlagPlacement();
  initFlagDragDrop();
  
  // Hide ghost flag on any click outside
  // Store the handler for potential cleanup
  globalEventHandlers.click = function() {
    hideGhostFlag();
  };
  document.addEventListener('click', globalEventHandlers.click);
}

/**
 * Add CSS for flag pulse animation
 * Creates and adds a style element with keyframe animation for ghost flag
 */
function addFlagPulseCSS() {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes flagPulse {
      0%   { transform: scale(0.7); box-shadow: 0 0 10px rgba(0, 255, 0, 0.7); }
      50%  { transform: scale(0.8); box-shadow: 0 0 15px rgba(0, 255, 0, 0.9); }
      100% { transform: scale(0.7); box-shadow: 0 0 10px rgba(0, 255, 0, 0.7); }
    }
    
    .ghost-flag {
      animation: flagPulse 1.5s ease-in-out infinite;
      position: absolute;
      z-index: 1000;
      pointer-events: none;
      opacity: 0.7;
      box-shadow: 0 0 10px rgba(0, 255, 0, 0.7);
      border: 2px solid #00FF00;
    }
  `;
  document.head.appendChild(style);
}

/**
 * Update the menu icons to match the deployed flags
 * Creates canvas images for start and finish flags and sets them as background images
 */
function updateMenuIcons() {
  const startIcon = document.getElementById('startPointIcon');
  const finishIcon = document.getElementById('finishPointIcon');
  
  if (startIcon) {
    startIcon.innerHTML = '';
    const startCanvas = createStartArchImage();
    startIcon.style.backgroundImage = `url(${startCanvas.toDataURL('image/png')})`;
    startIcon.style.backgroundSize = 'contain';
    startIcon.style.backgroundRepeat = 'no-repeat';
    startIcon.style.backgroundPosition = 'center';
  }
  
  if (finishIcon) {
    finishIcon.innerHTML = '';
    const finishCanvas = createFinishArchImage();
    finishIcon.style.backgroundImage = `url(${finishCanvas.toDataURL('image/png')})`;
    finishIcon.style.backgroundSize = 'contain';
    finishIcon.style.backgroundRepeat = 'no-repeat';
    finishIcon.style.backgroundPosition = 'center';
  }
}

/**
 * Create ghost flag element for pickup and drop
 * Creates a div element for the ghost flag and adds it to the document body
 */
function createGhostFlagElement() {
  // Remove existing ghost flag if it exists
  if (flagsState.ghostFlagElement) {
    try {
      document.body.removeChild(flagsState.ghostFlagElement);
    } catch (e) {
      console.error("Error removing existing ghost flag:", e);
    }
  }
  
  // Create new ghost flag element
  const ghostFlag = document.createElement('div');
  ghostFlag.className = 'flag-icon ghost-flag';
  ghostFlag.style.display = 'none';
  ghostFlag.id = 'ghost-flag-element'; 
  document.body.appendChild(ghostFlag);
  
  // Store reference to ghost flag element
  flagsState.ghostFlagElement = ghostFlag;
  console.log("Ghost flag created:", ghostFlag.id);
}

/**
 * Update ghost flag position
 * Updates the position of the ghost flag element based on mouse coordinates
 * 
 * @param {number} x - X coordinate of mouse
 * @param {number} y - Y coordinate of mouse
 */
function updateGhostFlagPosition(x, y) {
  if (!flagsState.flagPickedUp || !flagsState.ghostFlagElement) return;
  
  flagsState.ghostFlagElement.style.left = (x - 35) + 'px';
  flagsState.ghostFlagElement.style.top = (y - 35) + 'px';
}

/**
 * Show ghost flag
 * Shows the ghost flag element at the specified position
 * 
 * @param {string} flagType - Type of flag ('start' or 'finish')
 * @param {number} x - X coordinate to show ghost flag
 * @param {number} y - Y coordinate to show ghost flag
 */
function showGhostFlag(flagType, x, y) {
  if (!flagsState.ghostFlagElement) {
    createGhostFlagElement();
  }
  
  const isStart = (flagType === 'start');
  const flagCanvas = isStart ? createStartArchImage() : createFinishArchImage();
  
  flagsState.ghostFlagElement.style.display = 'block';
  flagsState.ghostFlagElement.style.width = `${flagCanvas.width}px`;
  flagsState.ghostFlagElement.style.height = `${flagCanvas.height}px`;
  flagsState.ghostFlagElement.style.backgroundImage = `url(${flagCanvas.toDataURL('image/png')})`;
  flagsState.ghostFlagElement.style.backgroundSize = 'cover';
  flagsState.ghostFlagElement.style.left = (x - 35) + 'px';
  flagsState.ghostFlagElement.style.top = (y - 35) + 'px';
  
  console.log('Ghost flag shown:', flagType);
}

/**
 * Hide ghost flag
 * Hides the ghost flag element
 */
function hideGhostFlag() {
  if (flagsState.ghostFlagElement) {
    flagsState.ghostFlagElement.style.display = 'none';
  }
}

/**
 * Setup prevention of map movement during flag interaction
 * Overrides Cesium's mouse event handlers to prevent map movement during flag interaction
 */
function setupMapMovementPrevention() {
  if (!viewerRef || !viewerRef.scene || !viewerRef.scene.screenSpaceCameraController) {
    console.error("Viewer reference not properly initialized");
    return;
  }

  const originalMouseMove = viewerRef.scene.screenSpaceCameraController.handleMouseMove;
  const originalMouseDown = viewerRef.scene.screenSpaceCameraController._onMouseDown;
  const originalMouseUp   = viewerRef.scene.screenSpaceCameraController._onMouseUp;

  viewerRef.scene.screenSpaceCameraController.handleMouseMove = function(movement) {
    if (flagsState.preventMapMovement || 
        flagsState.movingPlacedFlag || 
        flagsState.isDragging || 
        flagsState.hoveringOverFlag || 
        flagsState.flagPickedUp) {
      return;
    }
    return originalMouseMove.call(this, movement);
  };

  viewerRef.scene.screenSpaceCameraController._onMouseDown = function(e) {
    if (flagsState.preventMapMovement || 
        flagsState.movingPlacedFlag || 
        flagsState.isDragging || 
        flagsState.hoveringOverFlag || 
        flagsState.flagPickedUp) {
      return;
    }
    return originalMouseDown.call(this, e);
  };

  viewerRef.scene.screenSpaceCameraController._onMouseUp = function(e) {
    if (flagsState.preventMapMovement || 
        flagsState.movingPlacedFlag || 
        flagsState.isDragging || 
        flagsState.flagPickedUp) {
      return;
    }
    return originalMouseUp.call(this, e);
  };
}

/**
 * Setup detection for when mouse is hovering over a flag
 * Sets up a Cesium screen space event handler to detect when mouse is hovering over a flag
 */
function setupFlagHoverDetection() {
  if (!viewerRef || !viewerRef.scene) return;

  const handler = new Cesium.ScreenSpaceEventHandler(viewerRef.scene.canvas);

  handler.setInputAction(movement => {
    const flagType = isPointInFlagHitBox(movement.endPosition.x, movement.endPosition.y);

    if (flagType) {
      if (!flagsState.hoveringOverFlag) {
        flagsState.hoveringOverFlag = true;
        disableCameraControls();
      }
    } else {
      if (flagsState.hoveringOverFlag && 
          !flagsState.movingPlacedFlag && 
          !flagsState.isDragging && 
          !flagsState.flagPickedUp) {
        flagsState.hoveringOverFlag = false;
        restoreCameraControls();
      }
    }
    
    if (flagsState.flagPickedUp) {
      updateGhostFlagPosition(movement.endPosition.x, movement.endPosition.y);
    } else {
      hideGhostFlag();
    }
  }, Cesium.ScreenSpaceEventType.MOUSE_MOVE);
}

/**
 * Completely disable camera controls
 * Disables all camera controls in Cesium viewer
 */
function disableCameraControls() {
  if (!viewerRef || !viewerRef.scene || !viewerRef.scene.screenSpaceCameraController) return;
  viewerRef.scene.screenSpaceCameraController.enableInputs = false;
}

/**
 * Restore camera controls to original state
 * Restores camera controls to their original state if no flag interaction is in progress
 */
function restoreCameraControls() {
  if (!viewerRef || !viewerRef.scene || 
      !viewerRef.scene.screenSpaceCameraController ||
      !flagsState.originalCameraController) {
    return;
  }

  if (flagsState.movingPlacedFlag || 
      flagsState.isDragging || 
      flagsState.hoveringOverFlag || 
      flagsState.flagPickedUp) {
    return;
  }
  viewerRef.scene.screenSpaceCameraController.enableInputs =
    flagsState.originalCameraController.enableInputs;
}

/**
 * Check if a point is in a flag hit box
 * 
 * @param {number} x - X coordinate to check
 * @param {number} y - Y coordinate to check
 * @returns {string|null} - Flag type ('start' or 'finish') if point is in hit box, null otherwise
 */
function isPointInFlagHitBox(x, y) {
  for (const hitBox of flagsState.flagHitBoxes) {
    if (x >= hitBox.left && x <= hitBox.right &&
        y >= hitBox.top && y <= hitBox.bottom) {
      return hitBox.flagType;
    }
  }
  return null;
}

/**
 * Update flag hit boxes
 * Updates the hit boxes for flag detection based on current flag positions
 */
function updateFlagHitBoxes() {
  flagsState.flagHitBoxes = [];

  if (flagsState.startFlag) {
    const startPos = flagsState.startFlag.position;
    const windowPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
      viewerRef.scene, startPos);
    if (windowPos) {
      flagsState.flagHitBoxes.push({
        left:   windowPos.x - 35,
        right:  windowPos.x + 35,
        top:    windowPos.y - 35,
        bottom: windowPos.y + 35,
        flagType: 'start'
      });
    }
  }

  if (flagsState.finishFlag) {
    const finishPos = flagsState.finishFlag.position;
    const windowPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
      viewerRef.scene, finishPos);
    if (windowPos) {
      flagsState.flagHitBoxes.push({
        left:   windowPos.x - 35,
        right:  windowPos.x + 35,
        top:    windowPos.y - 35,
        bottom: windowPos.y + 35,
        flagType: 'finish'
      });
    }
  }
}

/**
 * Remove animation markers
 * Removes all animation markers from the viewer
 */
function removeAnimationMarkers() {
  for (const m of animationState.markers) {
    viewerRef.entities.remove(m);
  }
  animationState.markers = [];
}

/**
 * Update animation markers
 * Updates the position of animation markers based on current animation time
 */
function updateAnimationMarkers() {
  removeAnimationMarkers();
  const now = animationState.currentTime;
  if (!now) return;

  for (const kd of kmlDataListRef) {
    if (!kd.visible || !kd.syncedTimestamps || !kd.syncedTimestamps.length) {
      continue;
    }
    let closestIdx = 0;
    let minDiff = Infinity;
    for (let j = 0; j < kd.syncedTimestamps.length; j++) {
      const tDiff = Math.abs(kd.syncedTimestamps[j].time - now);
      if (tDiff < minDiff) {
        minDiff = tDiff;
        closestIdx = j;
      }
    }
    const coord = kd.syncedTimestamps[closestIdx].coord;
    const pos = Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
    if (pos) {
      const marker = viewerRef.entities.add({
        position: pos,
        point: {
          pixelSize: 12,
          color: kd.color,
          outlineColor: Cesium.Color.WHITE,
          outlineWidth: 2,
        },
      });
      animationState.markers.push(marker);
      kd.marker = marker;
    }
  }
}

/**
 * The main animation loop
 * Updates animation state and markers based on elapsed time
 */
function animationLoop() {
  if (!animationState.playing) return;
  
  const now = Date.now();
  // Use a smaller time step to prevent large jumps
  const elapsed = Math.min((now - animationState.lastUpdateTime), 100) * animationState.speed;
  animationState.lastUpdateTime = now;

  if (!animationState.currentTime || !animationState.endTime) {
    stopAnimation();
    if (fileInfoRef) fileInfoRef.textContent = "Animation error: invalid time";
    return;
  }
  
  // Ensure we don't jump past the end time
  const newTimeMs = animationState.currentTime.getTime() + elapsed;
  const endTimeMs = animationState.endTime.getTime();
  
  // If we're about to go past the end time, just set to end time
  if (newTimeMs >= endTimeMs) {
    animationState.currentTime = new Date(endTimeMs);
    updateAnimationMarkers();
    stopAnimation();
    if (fileInfoRef) fileInfoRef.textContent = "Animation complete: reached end time";
    return;
  }
  
  const newTime = new Date(newTimeMs);
  
  // If finish gate is placed, check if a rider reached it
  if (flagsState.finishFlag) {
    let anyRiderFinished = false;
    for (const kd of kmlDataListRef) {
      if (!kd.visible || !kd.syncedTimestamps || !kd.syncedTimestamps.length) {
        continue;
      }
      let closestIdx = 0;
      let minDiff = Infinity;
      for (let j = 0; j < kd.syncedTimestamps.length; j++) {
        const tDiff = Math.abs(kd.syncedTimestamps[j].time - newTime);
        if (tDiff < minDiff) {
          minDiff = tDiff;
          closestIdx = j;
        }
      }
      const coord = kd.syncedTimestamps[closestIdx].coord;
      const riderPos = Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
      const finishPos = flagsState.finishFlag.position.getValue(Cesium.JulianDate.now());
      const distance = Cesium.Cartesian3.distance(riderPos, finishPos);
      if (distance < 10) {
        anyRiderFinished = true;
        break;
      }
    }
    if (anyRiderFinished) {
      animationState.currentTime = newTime;
      updateAnimationMarkers();
      stopAnimation();
      if (fileInfoRef) fileInfoRef.textContent = "Animation complete: rider reached finish gate";
      return;
    }
  } else {
    // If no finish gate, end the race when the first rider runs out of data
    let anyRiderOutOfData = false;
    for (const kd of kmlDataListRef) {
      if (!kd.visible || !kd.syncedTimestamps || !kd.syncedTimestamps.length) {
        continue;
      }
      if (newTime >= kd.syncedTimestamps[kd.syncedTimestamps.length - 1].time) {
        anyRiderOutOfData = true;
        break;
      }
    }
    if (anyRiderOutOfData) {
      animationState.currentTime = newTime;
      updateAnimationMarkers();
      stopAnimation();
      if (fileInfoRef) fileInfoRef.textContent = "Animation complete: rider reached end of data";
      return;
    }
  }
  
  animationState.currentTime = newTime;
  updateAnimationMarkers();
  
  // Update timeline slider position
  updateTimelineSliderPosition();
  
  requestAnimationFrame(animationLoop);
}

/**
 * Update timeline slider position based on current time
 * Updates the position of the timeline slider and current time label
 */
function updateTimelineSliderPosition() {
  const timelineSlider = document.getElementById('timelineSlider');
  if (!timelineSlider || !animationState.startTime || !animationState.endTime || !animationState.currentTime) {
    return;
  }
  
  const startMs = animationState.startTime.getTime();
  const endMs = animationState.endTime.getTime();
  const currentMs = animationState.currentTime.getTime();
  const totalRange = endMs - startMs;
  
  if (totalRange <= 0) return;
  
  const position = ((currentMs - startMs) / totalRange) * 100;
  timelineSlider.value = position;
  
  // Update current time label
  const currentTimeLabel = document.getElementById('current-time-label');
  if (currentTimeLabel) {
    currentTimeLabel.textContent = formatTime(animationState.currentTime);
  }
}

/**
 * Start animation
 * Starts the animation playback
 */
function startAnimation() {
  if (animationState.playing) return;

  // Always re-sync so everyone starts from the same time
  syncTracksToStart();

  let hasData = false;
  for (const kd of kmlDataListRef) {
    if (kd.visible && kd.syncedTimestamps && kd.syncedTimestamps.length) {
      hasData = true;
      break;
    }
  }
  if (!hasData) {
    if (fileInfoRef) fileInfoRef.textContent = "No data to animate";
    return;
  }
  
  if (!animationState.currentTime) {
    animationState.currentTime = animationState.startTime || new Date();
  }
  
  if (!animationState.endTime) {
    if (fileInfoRef) fileInfoRef.textContent = "No end time for animation";
    return;
  }
  
  // Check if start and end times are too close
  const minDuration = 5000; // 5 seconds minimum duration
  if (animationState.endTime.getTime() - animationState.startTime.getTime() < minDuration) {
    // If too close, artificially extend the end time
    animationState.endTime = new Date(animationState.startTime.getTime() + minDuration);
    if (fileInfoRef) fileInfoRef.textContent = "Warning: Start and finish flags are very close. Extended animation duration.";
  }
  
  // Reset current time to start time when starting animation
  animationState.currentTime = new Date(animationState.startTime.getTime());
  animationState.playing = true;
  animationState.lastUpdateTime = Date.now();
  requestAnimationFrame(animationLoop);
  
  if (fileInfoRef) fileInfoRef.textContent = "Animation started";
}

/**
 * Stop animation
 * Stops the animation playback
 */
function stopAnimation() {
  animationState.playing = false;
  if (fileInfoRef) fileInfoRef.textContent = "Animation stopped";
}

/**
 * Reset animation
 * Resets the animation to the start time
 */
function resetAnimation() {
  stopAnimation();
  animationState.currentTime = new Date(animationState.startTime.getTime());
  updateAnimationMarkers();
  updateTimelineSliderPosition();
  if (fileInfoRef) fileInfoRef.textContent = "Animation reset to start";
}

/**
 * Set animation speed
 * Sets the animation playback speed
 * 
 * @param {number} speed - Animation playback speed multiplier
 */
function setAnimationSpeed(speed) {
  animationState.speed = speed;
  if (fileInfoRef) fileInfoRef.textContent = `Animation speed: ${speed}x`;
}

/**
 * Set animation position
 * Sets the animation position based on timeline slider position
 * 
 * @param {number} position - Position in percent (0-100)
 */
function setAnimationPosition(position) {
  if (!animationState.startTime || !animationState.endTime) return;
  const range = animationState.endTime.getTime() - animationState.startTime.getTime();
  const newTime = new Date(animationState.startTime.getTime() + range * (position / 100));
  
  animationState.currentTime = newTime;
  updateAnimationMarkers();
  
  // Update current time label
  const currentTimeLabel = document.getElementById('current-time-label');
  if (currentTimeLabel) {
    currentTimeLabel.textContent = formatTime(animationState.currentTime);
  }
}

/**
 * Find shortest track end
 * Returns whichever track ends soonest
 * 
 * @returns {Object|null} - Track with shortest duration, or null if no tracks
 */
function findShortestTrackEnd() {
  if (!kmlDataListRef.length) return null;
  
  let shortestDuration = Infinity;
  let shortestTrack = null;
  
  for (const kd of kmlDataListRef) {
    if (!kd.visible || !kd.timestamps || kd.timestamps.length < 2) continue;
    
    const duration = kd.timestamps[kd.timestamps.length - 1].time - kd.timestamps[0].time;
    if (duration < shortestDuration) {
      shortestDuration = duration;
      shortestTrack = kd;
    }
  }
  
  return shortestTrack;
}

/**
 * Find closest point to start flag
 * Finds the closest point to the start flag for each track
 * 
 * @returns {Object|null} - Object with trackIndex and pointIndex, or null if no start flag
 */
function findClosestPointToStartFlag() {
  if (!flagsState.startFlag || !kmlDataListRef.length) return null;
  
  const startFlagPos = flagsState.startFlag.position.getValue(Cesium.JulianDate.now());
  if (!startFlagPos) return null;
  
  let closestTrackIndex = -1;
  let closestPointIndex = -1;
  let minDistance = Infinity;
  
  // Find the closest point across all tracks
  for (let i = 0; i < kmlDataListRef.length; i++) {
    const track = kmlDataListRef[i];
    if (!track.visible || !track.coordinates || !track.coordinates.length) continue;
    
    for (let j = 0; j < track.coordinates.length; j++) {
      const coord = track.coordinates[j];
      const pointPos = Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
      const distance = Cesium.Cartesian3.distance(startFlagPos, pointPos);
      
      if (distance < minDistance) {
        minDistance = distance;
        closestTrackIndex = i;
        closestPointIndex = j;
      }
    }
  }
  
  if (closestTrackIndex >= 0 && closestPointIndex >= 0) {
    return {
      trackIndex: closestTrackIndex,
      pointIndex: closestPointIndex
    };
  }
  
  return null;
}

/**
 * Calculate distance between flags
 * Calculates the distance between start and finish flags
 * 
 * @returns {number} - Distance between flags, or Infinity if flags not placed
 */
function calculateDistanceBetweenFlags() {
  if (!flagsState.startFlag || !flagsState.finishFlag) return Infinity;
  
  const startPos = flagsState.startFlag.position.getValue(Cesium.JulianDate.now());
  const finishPos = flagsState.finishFlag.position.getValue(Cesium.JulianDate.now());
  
  if (!startPos || !finishPos) return Infinity;
  
  return Cesium.Cartesian3.distance(startPos, finishPos);
}

/**
 * Sync tracks to start
 * Aligns all tracks to start at the same time at the start flag
 * This is the CRITICAL function for ensuring proper time-based progression
 */
function syncTracksToStart() {
  if (!kmlDataListRef.length) return;
  
  // If start flag is placed, find the closest point across all tracks
  let refTrackIdx = -1;
  let refPointIdx = -1;
  
  if (flagsState.startFlag) {
    const closestPoint = findClosestPointToStartFlag();
    if (closestPoint) {
      refTrackIdx = closestPoint.trackIndex;
      refPointIdx = closestPoint.pointIndex;
    }
  } else if (flagsState.startTrackIndex >= 0 && 
      flagsState.startPointIndex >= 0 && 
      flagsState.startTrackIndex < kmlDataListRef.length) {
    refTrackIdx = flagsState.startTrackIndex;
    refPointIdx = flagsState.startPointIndex;
  } else {
    // Otherwise use the track with the most points
    let maxPoints = 0;
    for (let i = 0; i < kmlDataListRef.length; i++) {
      const kd = kmlDataListRef[i];
      if (kd.visible && kd.timestamps.length > maxPoints) {
        maxPoints = kd.timestamps.length;
        refTrackIdx = i;
      }
    }
    refPointIdx = 0; // Start at beginning
  }
  
  if (refTrackIdx < 0 || refTrackIdx >= kmlDataListRef.length) {
    console.error("No valid reference track for sync");
    return;
  }
  
  const refTrack = kmlDataListRef[refTrackIdx];
  if (!refTrack.timestamps || refTrack.timestamps.length <= refPointIdx) {
    console.error("Reference track has no valid timestamps");
    return;
  }
  
  // Find finish point if set
  let finishTrackIdx = -1;
  let finishPointIdx = -1;
  
  if (flagsState.finishTrackIndex >= 0 && 
      flagsState.finishPointIndex >= 0 && 
      flagsState.finishTrackIndex < kmlDataListRef.length) {
    finishTrackIdx = flagsState.finishTrackIndex;
    finishPointIdx = flagsState.finishPointIndex;
  } else {
    // If no finish flag, use end of reference track
    finishTrackIdx = refTrackIdx;
    finishPointIdx = refTrack.timestamps.length - 1;
  }
  
  // Set global start/end times
  const globalStart = refTrack.timestamps[refPointIdx].time;
  let globalEnd;
  
  if (finishTrackIdx >= 0 && finishTrackIdx < kmlDataListRef.length) {
    const finishTrack = kmlDataListRef[finishTrackIdx];
    if (finishTrack.timestamps && finishTrack.timestamps.length > finishPointIdx) {
      globalEnd = finishTrack.timestamps[finishPointIdx].time;
      
      // Check if start and end times are too close
      const minDuration = 5000; // 5 seconds minimum duration
      if (globalEnd.getTime() - globalStart.getTime() < minDuration) {
        // If too close, artificially extend the end time
        globalEnd = new Date(globalStart.getTime() + minDuration);
      }
    } else {
      // Fallback: use shortest track end
      const shortestTrack = findShortestTrackEnd();
      if (shortestTrack && shortestTrack.timestamps && shortestTrack.timestamps.length > 1) {
        globalEnd = shortestTrack.timestamps[shortestTrack.timestamps.length - 1].time;
      } else {
        // Last resort: add 10 minutes to start
        globalEnd = new Date(globalStart.getTime() + 10 * 60 * 1000);
      }
    }
  } else {
    // Fallback: use shortest track end
    const shortestTrack = findShortestTrackEnd();
    if (shortestTrack && shortestTrack.timestamps && shortestTrack.timestamps.length > 1) {
      globalEnd = shortestTrack.timestamps[shortestTrack.timestamps.length - 1].time;
    } else {
      // Last resort: add 10 minutes to start
      globalEnd = new Date(globalStart.getTime() + 10 * 60 * 1000);
    }
  }
  
  // Update animation state
  animationState.startTime = globalStart;
  animationState.endTime = globalEnd;
  if (!animationState.currentTime) {
    animationState.currentTime = globalStart;
  }
  
  // Create synced timestamps for each track using TIME-BASED PROGRESSION
  for (let i = 0; i < kmlDataListRef.length; i++) {
    const kd = kmlDataListRef[i];
    if (!kd.visible) continue;
    
    // Use time-based progression for synchronization
    createTimeSyncedTimestamps(kd, refTrackIdx, refPointIdx, globalStart);
  }
  
  // Update timeline labels
  updateTimelineLabels();
  
  // Trigger recalculation of time difference and lost time
  if (settingsRef && settingsRef.colorMode) {
    const currentColorMode = settingsRef.colorMode;
    if (currentColorMode === 'timeDifference' || currentColorMode === 'lostTime') {
      // Force update of color mode to recalculate time difference and lost time
      if (typeof updateColorMode === 'function') {
        updateColorMode();
      } else if (typeof window.updateColorMode === 'function') {
        window.updateColorMode();
      }
    }
  }
  
  if (fileInfoRef) fileInfoRef.textContent = "Tracks synchronized to start point";
}

/**
 * Create time-based synced timestamps
 * Creates synced timestamps for a track using time-based progression
 * This is the CRITICAL function for ensuring proper race timing
 * 
 * @param {Object} track - Track to create synced timestamps for
 * @param {number} refTrackIdx - Index of reference track
 * @param {number} refPointIdx - Index of reference point
 * @param {Date} globalStart - Global start time
 */
function createTimeSyncedTimestamps(track, refTrackIdx, refPointIdx, globalStart) {
  if (!track || !track.timestamps || track.timestamps.length === 0) return;
  
  // Clear existing synced timestamps
  track.syncedTimestamps = [];
  
  // Find the closest point to the start flag for this track
  let trackStartIdx = 0;
  
  // If start flag is placed, find closest point on this track
  if (flagsState.startFlag) {
    const startFlagPos = flagsState.startFlag.position.getValue(Cesium.JulianDate.now());
    if (startFlagPos) {
      let minDist = Infinity;
      for (let i = 0; i < track.coordinates.length; i++) {
        const coord = track.coordinates[i];
        const pos = Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
        const dist = Cesium.Cartesian3.distance(startFlagPos, pos);
        if (dist < minDist) {
          minDist = dist;
          trackStartIdx = i;
        }
      }
    }
  }
  
  // Calculate time offset from the start point
  const trackStartTime = track.timestamps[trackStartIdx].time;
  const timeOffset = globalStart.getTime() - trackStartTime.getTime();
  
  // Create synced timestamps by applying the time offset to each original timestamp
  // This preserves the original time progression of each track after synchronization
  for (let i = 0; i < track.timestamps.length; i++) {
    const originalTime = track.timestamps[i].time;
    const syncedTime = new Date(originalTime.getTime() + timeOffset);
    
    track.syncedTimestamps.push({
      time: syncedTime,
      coord: track.timestamps[i].coord
    });
  }
}

/**
 * Update timeline labels
 * Updates the timeline slider labels with formatted times
 */
function updateTimelineLabels() {
  const startLabel = document.getElementById('start-time-label');
  const endLabel = document.getElementById('end-time-label');
  const currentLabel = document.getElementById('current-time-label');
  
  if (startLabel && animationState.startTime) {
    startLabel.textContent = formatTime(animationState.startTime);
  }
  
  if (endLabel && animationState.endTime) {
    endLabel.textContent = formatTime(animationState.endTime);
  }
  
  if (currentLabel && animationState.currentTime) {
    currentLabel.textContent = formatTime(animationState.currentTime);
  }
}

/**
 * Format time
 * Formats a Date object as HH:MM:SS
 * 
 * @param {Date} date - Date to format
 * @returns {string} - Formatted time string
 */
function formatTime(date) {
  if (!date) return "00:00:00";
  const h = date.getHours().toString().padStart(2, '0');
  const m = date.getMinutes().toString().padStart(2, '0');
  const s = date.getSeconds().toString().padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Animate flag to optimal position
 * Animates a flag to the optimal position on a track
 * 
 * @param {boolean} isStart - Whether this is the start flag
 * @param {number} trackIndex - Index of track
 * @param {number} initialIndex - Initial index on track
 * @param {number} optimalIndex - Optimal index on track
 */
function animateFlagToOptimalPosition(isStart, trackIndex, initialIndex, optimalIndex) {
  if (trackIndex < 0 || trackIndex >= kmlDataListRef.length) return;
  
  const track = kmlDataListRef[trackIndex];
  if (!track.coordinates || !track.coordinates[optimalIndex]) return;
  
  const coord = track.coordinates[optimalIndex];
  const position = Cesium.Cartesian3.fromDegrees(coord[0], coord[1], coord[2]);
  
  if (isStart) {
    if (flagsState.startFlag) {
      viewerRef.entities.remove(flagsState.startFlag);
    }
    
    flagsState.startFlag = viewerRef.entities.add({
      name: 'Start Flag',
      position: position,
      billboard: {
        image: getStartFlagDataURL(),
        width: 70,
        height: 70,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        scale: 0.7,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    flagsState.startTrackIndex = trackIndex;
    flagsState.startPointIndex = optimalIndex;
    
    const startIcon = document.getElementById('startPointIcon');
    if (startIcon) {
      startIcon.classList.add('flag-deployed');
      startIcon.draggable = false;
      startIcon.style.pointerEvents = 'none';
    }
    
    if (fileInfoRef) fileInfoRef.textContent = "Start flag placed";
  } else {
    if (flagsState.finishFlag) {
      viewerRef.entities.remove(flagsState.finishFlag);
    }
    
    flagsState.finishFlag = viewerRef.entities.add({
      name: 'Finish Flag',
      position: position,
      billboard: {
        image: getFinishFlagDataURL(),
        width: 70,
        height: 70,
        verticalOrigin: Cesium.VerticalOrigin.BOTTOM,
        horizontalOrigin: Cesium.HorizontalOrigin.CENTER,
        scale: 0.7,
        disableDepthTestDistance: Number.POSITIVE_INFINITY
      }
    });
    
    flagsState.finishTrackIndex = trackIndex;
    flagsState.finishPointIndex = optimalIndex;
    
    const finishIcon = document.getElementById('finishPointIcon');
    if (finishIcon) {
      finishIcon.classList.add('flag-deployed');
      finishIcon.draggable = false;
      finishIcon.style.pointerEvents = 'none';
    }
    
    if (fileInfoRef) fileInfoRef.textContent = "Finish flag placed";
  }
  
  // Re-sync tracks if start flag was placed
  if (isStart) {
    syncTracksToStart();
  }
  
  // Update hit boxes
  updateFlagHitBoxes();
}

/**
 * Reset flags
 * Resets all flags and related state
 */
function resetFlags() {
  // Set the isResetting flag to prevent race conditions
  flagsState.isResetting = true;
  
  // Remove flag entities from viewer
  if (flagsState.startFlag) {
    viewerRef.entities.remove(flagsState.startFlag);
    flagsState.startFlag = null;
  }
  
  if (flagsState.finishFlag) {
    viewerRef.entities.remove(flagsState.finishFlag);
    flagsState.finishFlag = null;
  }
  
  // Reset flag state
  flagsState.startTrackIndex = -1;
  flagsState.startPointIndex = -1;
  flagsState.finishTrackIndex = -1;
  flagsState.finishPointIndex = -1;
  flagsState.draggingStart = false;
  flagsState.draggingFinish = false;
  flagsState.movingPlacedFlag = false;
  flagsState.currentMovingFlag = null;
  flagsState.flagAdjustmentInProgress = false;
  flagsState.initialFlagPosition = null;
  flagsState.isDragging = false;
  flagsState.draggedFlagElement = null;
  flagsState.draggedFlagType = null;
  flagsState.startFlagDeployed = false;
  flagsState.finishFlagDeployed = false;
  flagsState.preventMapMovement = false;
  flagsState.flagHitBoxes = [];
  flagsState.hoveringOverFlag = false;
  flagsState.flagPickedUp = false;
  flagsState.pickedUpFlagType = null;
  flagsState.justReset = true;
  
  // Hide ghost flag
  hideGhostFlag();
  
  // Update UI elements
  const startIcon = document.getElementById('startPointIcon');
  const finishIcon = document.getElementById('finishPointIcon');
  
  if (startIcon) {
    startIcon.classList.remove('flag-deployed');
    startIcon.classList.remove('flag-adjusting');
    startIcon.style.pointerEvents = 'auto';
    startIcon.draggable = true;
  }
  if (finishIcon) {
    finishIcon.classList.remove('flag-deployed');
    finishIcon.classList.remove('flag-adjusting');
    finishIcon.style.pointerEvents = 'auto';
    finishIcon.draggable = true;
  }

  // Update menu icons
  updateMenuIcons();
  
  if (fileInfoRef) fileInfoRef.textContent = "Flags reset";

  // Restore camera controls
  restoreCameraControls();
  
  // Reset animation state when flags are reset
  if (animationState.playing) {
    stopAnimation();
  }
  
  // Reset animation time to start time
  if (animationState.startTime) {
    animationState.currentTime = new Date(animationState.startTime.getTime());
    updateAnimationMarkers();
    updateTimelineSliderPosition();
  }
  
  // Clear isResetting and justReset flags immediately to allow redeployment
  flagsState.isResetting = false;
  flagsState.justReset = false;
  
  // Force update menu icons to fix visual glitch
  setTimeout(() => {
    updateMenuIcons();
  }, 50);
}

/**
 * Create start arch image
 * Creates a canvas image for the start flag
 * 
 * @returns {HTMLCanvasElement} - Canvas element with start flag image
 */
function createStartArchImage() {
  const cv = document.createElement('canvas');
  cv.width = 70;
  cv.height = 70;
  const ctx = cv.getContext('2d');

  ctx.clearRect(0, 0, cv.width, cv.height);

  ctx.beginPath();
  ctx.moveTo(5, 60);
  ctx.lineTo(5, 30);
  ctx.bezierCurveTo(5, 10, 65, 10, 65, 30);
  ctx.lineTo(65, 60);
  ctx.lineWidth = 5;
  ctx.strokeStyle = '#0057B7';  // Blue
  ctx.stroke();

  ctx.font = 'bold 12px Arial';
  ctx.fillStyle = '#FFFFFF';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('START', 35, 20);

  ctx.fillStyle = '#333333';
  ctx.fillRect(5, 60, 60, 5);

  return cv;
}

/**
 * Create finish arch image
 * Creates a canvas image for the finish flag
 * 
 * @returns {HTMLCanvasElement} - Canvas element with finish flag image
 */
function createFinishArchImage() {
  const cv = document.createElement('canvas');
  cv.width = 70;
  cv.height = 70;
  const ctx = cv.getContext('2d');

  ctx.clearRect(0, 0, cv.width, cv.height);

  ctx.beginPath();
  ctx.moveTo(5, 60);
  ctx.lineTo(5, 30);
  ctx.bezierCurveTo(5, 10, 65, 10, 65, 30);
  ctx.lineTo(65, 60);
  ctx.lineWidth = 5;

  const checkPattern = ctx.createPattern(createCheckerPattern(), 'repeat');
  ctx.strokeStyle = checkPattern;
  ctx.stroke();

  ctx.fillStyle = '#333333';
  ctx.fillRect(5, 60, 60, 5);

  return cv;
}

/**
 * Create checker pattern
 * Creates a checker pattern for the finish arch
 * 
 * @returns {HTMLCanvasElement} - Canvas element with checker pattern
 */
function createCheckerPattern() {
  const patternCanvas = document.createElement('canvas');
  patternCanvas.width = 10;
  patternCanvas.height = 10;
  const patternCtx = patternCanvas.getContext('2d');

  patternCtx.fillStyle = '#FFFFFF';
  patternCtx.fillRect(0, 0, 5, 5);
  patternCtx.fillRect(5, 5, 5, 5);
  patternCtx.fillStyle = '#000000';
  patternCtx.fillRect(0, 5, 5, 5);
  patternCtx.fillRect(5, 0, 5, 5);

  return patternCanvas;
}

/**
 * Create flag image
 * Creates a flag image based on color
 * 
 * @param {string} color - Color of flag
 * @returns {HTMLCanvasElement} - Canvas element with flag image
 */
function createFlagImage(color) {
  if (color === '#4CAF50') {
    return createStartArchImage();
  } else {
    return createFinishArchImage();
  }
}

/**
 * Get start flag data URL
 * Returns the data URL for the start flag image
 * 
 * @returns {string} - Data URL for start flag image
 */
function getStartFlagDataURL() {
  const c = createStartArchImage();
  return c.toDataURL('image/png');
}

/**
 * Get finish flag data URL
 * Returns the data URL for the finish flag image
 * 
 * @returns {string} - Data URL for finish flag image
 */
function getFinishFlagDataURL() {
  const c = createFinishArchImage();
  return c.toDataURL('image/png');
}

/**
 * Find closest track within radius
 * Finds the closest track within a specified radius from screen coordinates
 * 
 * @param {number} screenX - X coordinate on the screen
 * @param {number} screenY - Y coordinate on the screen
 * @param {number} radiusPixels - Search radius in pixels
 * @returns {Object|null} - Object containing trackIndex and position if found, null otherwise
 */
function findClosestTrackWithinRadius(screenX, screenY, radiusPixels) {
  if (!viewerRef || !kmlDataListRef || kmlDataListRef.length === 0) {
    return null;
  }

  // Convert screen position to world coordinates
  const ray = viewerRef.camera.getPickRay(new Cesium.Cartesian2(screenX, screenY));
  const position = viewerRef.scene.globe.pick(ray, viewerRef.scene);
  
  if (!position) {
    return null; // No position under cursor
  }

  let closestTrackIndex = -1;
  let closestPointIndex = -1;
  let minDistance = Infinity;
  
  // Check each visible track
  for (let i = 0; i < kmlDataListRef.length; i++) {
    const track = kmlDataListRef[i];
    if (!track.visible || track.coordinates.length === 0) {
      continue;
    }
    
    // Find closest point on this track
    const pointIndex = track.findClosestPoint(position);
    if (pointIndex < 0) {
      continue;
    }
    
    // Get the coordinates of the closest point
    const pointCoords = track.coordinates[pointIndex];
    const pointCartesian = Cesium.Cartesian3.fromDegrees(
      pointCoords[0], 
      pointCoords[1], 
      pointCoords[2]
    );
    
    // Calculate distance between the point and the clicked position
    const distance = Cesium.Cartesian3.distance(position, pointCartesian);
    
    // Convert world distance to screen distance (approximate)
    const pointScreenPos = Cesium.SceneTransforms.wgs84ToWindowCoordinates(
      viewerRef.scene, 
      pointCartesian
    );
    
    if (!pointScreenPos) {
      continue;
    }
    
    const screenDistance = Math.sqrt(
      Math.pow(screenX - pointScreenPos.x, 2) + 
      Math.pow(screenY - pointScreenPos.y, 2)
    );
    
    // Check if this point is within the radius and closer than previous points
    if (screenDistance <= radiusPixels && distance < minDistance) {
      minDistance = distance;
      closestTrackIndex = i;
      closestPointIndex = pointIndex;
    }
  }
  
  // If we found a track within radius
  if (closestTrackIndex >= 0) {
    const track = kmlDataListRef[closestTrackIndex];
    const pointCoords = track.coordinates[closestPointIndex];
    const position = Cesium.Cartesian3.fromDegrees(
      pointCoords[0], 
      pointCoords[1], 
      pointCoords[2]
    );
    
    return {
      trackIndex: closestTrackIndex,
      pointIndex: closestPointIndex,
      position: position
    };
  }
  
  return null;
}

/**
 * Place flag
 * Handler for dropping flags on the globe or track
 * 
 * @param {boolean} isStart - Whether this is the start flag
 * @param {number} screenX - X coordinate on the screen
 * @param {number} screenY - Y coordinate on the screen
 * @returns {boolean} - Whether flag was successfully placed
 */
function placeFlag(isStart, screenX, screenY) {
  // Don't allow flag placement during reset
  if (flagsState.isResetting) {
    return false;
  }
  
  if (screenX !== undefined && screenY !== undefined) {
    // Dropped version - track snapping
    const closestTrack = findClosestTrackWithinRadius(screenX, screenY, 50);
    if (closestTrack) {
      const trackIndex = closestTrack.trackIndex;
      const cart = closestTrack.position;
      const initialIdx = kmlDataListRef[trackIndex].findClosestPoint(cart);
      if (initialIdx >= 0) {
        const optimalIdx = kmlDataListRef[trackIndex].findOptimalPointForAnimation(initialIdx);
        animateFlagToOptimalPosition(isStart, trackIndex, initialIdx, optimalIdx);

        // End the drag immediately if success
        flagsState.isDragging = false;
        if (flagsState.draggedFlagElement) {
          flagsState.draggedFlagElement.style.display = 'none';
        }
        hideGhostFlag();

        return true;
      }
    }
    return false;
  }

  // Single-click approach
  if (isStart) {
    flagsState.draggingStart = true;
    flagsState.draggingFinish = false;
    if (fileInfoRef) fileInfoRef.textContent = "Click on a track to place the start flag";
  } else {
    flagsState.draggingStart = false;
    flagsState.draggingFinish = true;
    if (fileInfoRef) fileInfoRef.textContent = "Click on a track to place the finish flag";
  }
  
  disableCameraControls();
  
  const handler = new Cesium.ScreenSpaceEventHandler(viewerRef.scene.canvas);
  
  handler.setInputAction(click => {
    const closestTrack = findClosestTrackWithinRadius(click.position.x, click.position.y, 50);
    if (closestTrack) {
      const trackIndex = closestTrack.trackIndex;
      const cart = closestTrack.position;
      const initialIdx = kmlDataListRef[trackIndex].findClosestPoint(cart);
      if (initialIdx >= 0) {
        const optimalIdx = kmlDataListRef[trackIndex].findOptimalPointForAnimation(initialIdx);
        animateFlagToOptimalPosition(isStart, trackIndex, initialIdx, optimalIdx);
      }
    } else {
      if (fileInfoRef) fileInfoRef.textContent = "No track found at click position";
    }
    
    flagsState.draggingStart = false;
    flagsState.draggingFinish = false;
    handler.destroy();
    restoreCameraControls();
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
  
  handler.setInputAction(() => {
    // Right-click => cancel
    flagsState.draggingStart = false;
    flagsState.draggingFinish = false;
    handler.destroy();
    
    if (fileInfoRef) fileInfoRef.textContent = "Flag placement cancelled";
    
    restoreCameraControls();
  }, Cesium.ScreenSpaceEventType.RIGHT_CLICK);
}

/**
 * Initialize flag placement
 * Sets up event handlers for flag placement
 * IMPORTANT: This should only be called ONCE at initialization
 */
function initFlagPlacement() {
  if (!viewerRef || !viewerRef.scene) {
    console.error("Viewer ref not properly initialized");
    return;
  }
  
  // Clean up existing handler if it exists
  if (flagPlacementHandler) {
    flagPlacementHandler.destroy();
  }
  
  // Create new handler
  flagPlacementHandler = new Cesium.ScreenSpaceEventHandler(viewerRef.scene.canvas);
  
  flagPlacementHandler.setInputAction(click => {
    // Don't allow flag placement during reset
    if (flagsState.isResetting) {
      return;
    }
    
    if (flagsState.justReset) {
      flagsState.startFlagDeployed = false;
      flagsState.finishFlagDeployed = false;
      flagsState.justReset = false;
    }
    
    if (flagsState.flagPickedUp) {
      const closestTrack = findClosestTrackWithinRadius(click.position.x, click.position.y, 50);
      if (closestTrack) {
        const trackIndex = closestTrack.trackIndex;
        const cart = closestTrack.position;
        const initialIdx = kmlDataListRef[trackIndex].findClosestPoint(cart);
        if (initialIdx >= 0) {
          const optimalIdx = kmlDataListRef[trackIndex].findOptimalPointForAnimation(initialIdx);
          
          if (flagsState.pickedUpFlagType === 'start' && flagsState.startFlag) {
            viewerRef.entities.remove(flagsState.startFlag);
            flagsState.startFlag = null;
          } else if (flagsState.pickedUpFlagType === 'finish' && flagsState.finishFlag) {
            viewerRef.entities.remove(flagsState.finishFlag);
            flagsState.finishFlag = null;
          }
          
          animateFlagToOptimalPosition(
            flagsState.pickedUpFlagType === 'start',
            trackIndex,
            initialIdx,
            optimalIdx
          );
          
          flagsState.flagPickedUp = false;
          flagsState.pickedUpFlagType = null;
          hideGhostFlag();
          
          flagsState.preventMapMovement = false;
          restoreCameraControls();
          
          if (fileInfoRef) {
            fileInfoRef.textContent = `${flagsState.pickedUpFlagType === 'start' ? 'Start' : 'Finish'} flag placed at new position`;
          }
        } else {
          flagsState.flagPickedUp = false;
          flagsState.pickedUpFlagType = null;
          hideGhostFlag();
          flagsState.preventMapMovement = false;
          restoreCameraControls();
          if (fileInfoRef) {
            fileInfoRef.textContent = "No track found at click position";
          }
        }
      } else {
        flagsState.flagPickedUp = false;
        flagsState.pickedUpFlagType = null;
        hideGhostFlag();
        flagsState.preventMapMovement = false;
        restoreCameraControls();
        if (fileInfoRef) {
          fileInfoRef.textContent = "No track found at click position";
        }
      }
      return;
    }
    
    // If we are currently dragging start or finish
    if (flagsState.draggingStart) {
      const closestTrack = findClosestTrackWithinRadius(click.position.x, click.position.y, 50);
      if (closestTrack) {
        const trackIndex = closestTrack.trackIndex;
        const cart = closestTrack.position;
        const initialIdx = kmlDataListRef[trackIndex].findClosestPoint(cart);
        if (initialIdx >= 0) {
          const optimalIdx = kmlDataListRef[trackIndex].findOptimalPointForAnimation(initialIdx);
          animateFlagToOptimalPosition(true, trackIndex, initialIdx, optimalIdx);
        }
      } else {
        if (fileInfoRef) fileInfoRef.textContent = "No track found at click position";
      }
      flagsState.draggingStart = false;
      flagsState.draggingFinish = false;
      restoreCameraControls();
    } else if (flagsState.draggingFinish) {
      const closestTrack = findClosestTrackWithinRadius(click.position.x, click.position.y, 50);
      if (closestTrack) {
        const trackIndex = closestTrack.trackIndex;
        const cart = closestTrack.position;
        const initialIdx = kmlDataListRef[trackIndex].findClosestPoint(cart);
        if (initialIdx >= 0) {
          const optimalIdx = kmlDataListRef[trackIndex].findOptimalPointForAnimation(initialIdx);
          animateFlagToOptimalPosition(false, trackIndex, initialIdx, optimalIdx);
        }
      } else {
        if (fileInfoRef) fileInfoRef.textContent = "No track found at click position";
      }
      flagsState.draggingStart = false;
      flagsState.draggingFinish = false;
      restoreCameraControls();
    }
  }, Cesium.ScreenSpaceEventType.LEFT_CLICK);
}

/**
 * Initialize flag drag & drop
 * Sets up event handlers for flag drag & drop
 * IMPORTANT: This should only be called ONCE at initialization
 */
function initFlagDragDrop() {
  const sIcon = document.getElementById('startPointIcon');
  const fIcon = document.getElementById('finishPointIcon');
  const container = document.getElementById('cesiumContainer');
  
  if (!sIcon || !fIcon || !container) {
    console.error("Flag icons or container not found");
    return;
  }
  
  const tempFlagElement = document.createElement('div');
  tempFlagElement.className = 'flag-icon';
  tempFlagElement.style.position = 'absolute';
  tempFlagElement.style.zIndex = '1000';
  tempFlagElement.style.display = 'none';
  tempFlagElement.id = 'temp-flag-element';
  document.body.appendChild(tempFlagElement);
  
  // START flag mousedown
  sIcon.addEventListener('mousedown', e => {
    // Don't allow flag placement during reset
    if (flagsState.isResetting) {
      return;
    }
    
    if (flagsState.justReset) {
      flagsState.startFlagDeployed = false;
      flagsState.finishFlagDeployed = false;
      flagsState.justReset = false;
    }
    if (flagsState.startFlagDeployed) {
      console.log("Start flag already deployed");
      return;
    }
    flagsState.isDragging = true;
    flagsState.draggedFlagType = 'start';
    flagsState.draggedFlagElement = tempFlagElement;
    flagsState.preventMapMovement = true;
    disableCameraControls();

    flagsState.mouseOffsetX = 35;
    flagsState.mouseOffsetY = 35;
    const startCanvas = createStartArchImage();
    tempFlagElement.style.display = 'block';
    tempFlagElement.style.width = `${startCanvas.width}px`;
    tempFlagElement.style.height = `${startCanvas.height}px`;
    tempFlagElement.style.backgroundImage = `url(${startCanvas.toDataURL('image/png')})`;
    tempFlagElement.style.backgroundSize = 'cover';
    tempFlagElement.style.left = (e.clientX - flagsState.mouseOffsetX) + 'px';
    tempFlagElement.style.top = (e.clientY - flagsState.mouseOffsetY) + 'px';
    tempFlagElement.style.transform = 'scale(0.7)';

    if (fileInfoRef) fileInfoRef.textContent = "Drag the start flag to a track and release";
    hideGhostFlag();
  });
  
  // FINISH flag mousedown
  fIcon.addEventListener('mousedown', e => {
    // Don't allow flag placement during reset
    if (flagsState.isResetting) {
      return;
    }
    
    if (flagsState.justReset) {
      flagsState.startFlagDeployed = false;
      flagsState.finishFlagDeployed = false;
      flagsState.justReset = false;
    }
    if (flagsState.finishFlagDeployed) {
      console.log("Finish flag already deployed");
      return;
    }
    flagsState.isDragging = true;
    flagsState.draggedFlagType = 'finish';
    flagsState.draggedFlagElement = tempFlagElement;
    flagsState.preventMapMovement = true;
    disableCameraControls();

    flagsState.mouseOffsetX = 35;
    flagsState.mouseOffsetY = 35;
    const finishCanvas = createFinishArchImage();
    tempFlagElement.style.display = 'block';
    tempFlagElement.style.width = `${finishCanvas.width}px`;
    tempFlagElement.style.height = `${finishCanvas.height}px`;
    tempFlagElement.style.backgroundImage = `url(${finishCanvas.toDataURL('image/png')})`;
    tempFlagElement.style.backgroundSize = 'cover';
    tempFlagElement.style.left = (e.clientX - flagsState.mouseOffsetX) + 'px';
    tempFlagElement.style.top = (e.clientY - flagsState.mouseOffsetY) + 'px';
    tempFlagElement.style.transform = 'scale(0.7)';

    if (fileInfoRef) fileInfoRef.textContent = "Drag the finish flag to a track and release";
    hideGhostFlag();
  });

  // Clean up existing global event handlers if they exist
  if (globalEventHandlers.mousemove) {
    document.removeEventListener('mousemove', globalEventHandlers.mousemove);
  }
  if (globalEventHandlers.mouseup) {
    document.removeEventListener('mouseup', globalEventHandlers.mouseup);
  }

  // Global mousemove
  globalEventHandlers.mousemove = e => {
    if (flagsState.isDragging && flagsState.draggedFlagElement) {
      flagsState.draggedFlagElement.style.left = (e.clientX - flagsState.mouseOffsetX) + 'px';
      flagsState.draggedFlagElement.style.top = (e.clientY - flagsState.mouseOffsetY) + 'px';
      hideGhostFlag();
    }
  };
  document.addEventListener('mousemove', globalEventHandlers.mousemove);

  // Global mouseup
  globalEventHandlers.mouseup = e => {
    if (flagsState.isDragging) {
      if (flagsState.draggedFlagElement) {
        flagsState.draggedFlagElement.style.display = 'none';
      }
      const isStart = (flagsState.draggedFlagType === 'start');
      const success = placeFlag(isStart, e.clientX, e.clientY);

      if (success) {
        if (isStart) {
          flagsState.startFlagDeployed = true;
        } else {
          flagsState.finishFlagDeployed = true;
        }
      } else if (fileInfoRef) {
        fileInfoRef.textContent = "Drop the flag on a track";
      }
      
      flagsState.isDragging = false;
      flagsState.draggedFlagType = null;
      flagsState.preventMapMovement = false;

      hideGhostFlag();
      restoreCameraControls();
    } else {
      hideGhostFlag();
    }
  };
  document.addEventListener('mouseup', globalEventHandlers.mouseup);

  // Legacy HTML5 drag & drop
  sIcon.addEventListener('dragstart', e => {
    // Don't allow flag placement during reset
    if (flagsState.isResetting) {
      e.preventDefault();
      return;
    }
    
    if (flagsState.justReset) {
      flagsState.startFlagDeployed = false;
      flagsState.finishFlagDeployed = false;
      flagsState.justReset = false;
    }
    if (flagsState.startFlagDeployed) {
      e.preventDefault();
      return;
    }
    flagsState.preventMapMovement = true;
    disableCameraControls();
    e.dataTransfer.setData('text/plain', 'start');
    e.dataTransfer.effectAllowed = 'move';

    const dragImg = document.createElement('div');
    dragImg.className = 'flag-icon';
    const startCanvas = createStartArchImage();
    dragImg.style.width = `${startCanvas.width}px`;
    dragImg.style.height = `${startCanvas.height}px`;
    dragImg.style.backgroundImage = `url(${startCanvas.toDataURL('image/png')})`;
    dragImg.style.backgroundSize = 'cover';
    dragImg.style.position = 'absolute';
    dragImg.style.top = '-1000px';
    dragImg.style.transform = 'scale(0.7)';
    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, 35, 35);
    setTimeout(() => document.body.removeChild(dragImg), 0);
  });

  fIcon.addEventListener('dragstart', e => {
    // Don't allow flag placement during reset
    if (flagsState.isResetting) {
      e.preventDefault();
      return;
    }
    
    if (flagsState.justReset) {
      flagsState.startFlagDeployed = false;
      flagsState.finishFlagDeployed = false;
      flagsState.justReset = false;
    }
    if (flagsState.finishFlagDeployed) {
      e.preventDefault();
      return;
    }
    flagsState.preventMapMovement = true;
    disableCameraControls();
    e.dataTransfer.setData('text/plain', 'finish');
    e.dataTransfer.effectAllowed = 'move';

    const dragImg = document.createElement('div');
    dragImg.className = 'flag-icon';
    const finishCanvas = createFinishArchImage();
    dragImg.style.width = `${finishCanvas.width}px`;
    dragImg.style.height = `${finishCanvas.height}px`;
    dragImg.style.backgroundImage = `url(${finishCanvas.toDataURL('image/png')})`;
    dragImg.style.backgroundSize = 'cover';
    dragImg.style.position = 'absolute';
    dragImg.style.top = '-1000px';
    dragImg.style.transform = 'scale(0.7)';
    document.body.appendChild(dragImg);
    e.dataTransfer.setDragImage(dragImg, 35, 35);
    setTimeout(() => document.body.removeChild(dragImg), 0);
  });

  container.addEventListener('dragover', e => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  });

  container.addEventListener('drop', e => {
    e.preventDefault();
    const data = e.dataTransfer.getData('text/plain');
    const isStart = (data === 'start');
    
    placeFlag(isStart, e.clientX, e.clientY);
    
    flagsState.preventMapMovement = false;
    restoreCameraControls();
  });
}

/**
 * Reset all flags
 * Called from main.js to reset all flags
 * This is the main entry point for resetting flags
 */
function resetAllFlags() {
  // Set the isResetting flag to prevent race conditions
  flagsState.isResetting = true;
  
  // Remove flag entities from viewer
  if (flagsState.startFlag) {
    viewerRef.entities.remove(flagsState.startFlag);
    flagsState.startFlag = null;
  }
  
  if (flagsState.finishFlag) {
    viewerRef.entities.remove(flagsState.finishFlag);
    flagsState.finishFlag = null;
  }
  
  // Reset flag state
  flagsState.startTrackIndex = -1;
  flagsState.startPointIndex = -1;
  flagsState.finishTrackIndex = -1;
  flagsState.finishPointIndex = -1;
  flagsState.draggingStart = false;
  flagsState.draggingFinish = false;
  flagsState.movingPlacedFlag = false;
  flagsState.currentMovingFlag = null;
  flagsState.flagAdjustmentInProgress = false;
  flagsState.initialFlagPosition = null;
  flagsState.isDragging = false;
  flagsState.draggedFlagElement = null;
  flagsState.draggedFlagType = null;
  flagsState.startFlagDeployed = false;
  flagsState.finishFlagDeployed = false;
  flagsState.preventMapMovement = false;
  flagsState.flagHitBoxes = [];
  flagsState.hoveringOverFlag = false;
  flagsState.flagPickedUp = false;
  flagsState.pickedUpFlagType = null;
  flagsState.justReset = false;  // Set to false immediately to allow redeployment
  
  // Hide ghost flag
  hideGhostFlag();
  
  // Update UI elements
  const startIcon = document.getElementById('startPointIcon');
  const finishIcon = document.getElementById('finishPointIcon');
  
  if (startIcon) {
    startIcon.classList.remove('flag-deployed');
    startIcon.classList.remove('flag-adjusting');
    startIcon.style.pointerEvents = 'auto';
    startIcon.draggable = true;
  }
  if (finishIcon) {
    finishIcon.classList.remove('flag-deployed');
    finishIcon.classList.remove('flag-adjusting');
    finishIcon.style.pointerEvents = 'auto';
    finishIcon.draggable = true;
  }

  // Update menu icons
  updateMenuIcons();
  
  if (fileInfoRef) fileInfoRef.textContent = "Flags reset";

  // Restore camera controls
  restoreCameraControls();
  
  // Reset animation state when flags are reset
  if (animationState.playing) {
    stopAnimation();
  }
  
  // Reset animation time to start time
  if (animationState.startTime) {
    animationState.currentTime = new Date(animationState.startTime.getTime());
    updateAnimationMarkers();
    updateTimelineSliderPosition();
  }
  
  // Clear isResetting flag immediately to allow redeployment
  flagsState.isResetting = false;
  
  // Force update menu icons to fix visual glitch
  setTimeout(() => {
    updateMenuIcons();
  }, 50);
}
