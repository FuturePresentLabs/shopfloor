    // ============================================
    // FLOOR PLAN EDITOR - Main Application
    // ============================================

    // Global state
    const state = {
      theme: 'dark',
      currentTool: 'wall',
      currentView: '2d',
      unit: 'in',
      gridSize: 6,
      isDrawing: false,
      isComplete: false,

      // Drawing state - pen tool
      penPoints: [],           // Raw points collected during drawing
      simplifiedPoints: [],    // Points after simplification
      editingPoints: false,    // Whether we're editing simplified points
      selectedPointIndex: -1,  // Index of selected control point
      hoveredPointIndex: -1,   // Index of hovered control point

      // Legacy drawing state
      wallStart: null,
      tempWallEnd: null,
      shapePoints: [],
      dimensionStart: null,

      // Rectangle drawing state
      rectStart: null,
      rectEnd: null,
      isDrawingRect: false,

      // Selection
      selectedObject: null,
      selectedObjects: [],      // Array for multi-object selection
      hoveredObject: null,
      selectedWallPoint: null,  // { wall, point: 'start' | 'end' }
      selectedWallPoints: [],   // Array of { wall, point } for multi-selection
      hoveredWallPoint: null,
      selectedFurnitureHandle: null,  // { furniture, corner/edge/radiusHandle }
      hoveredFurnitureHandle: null,

      // Marquee selection
      isMarqueeSelecting: false,
      marqueeStart: null,       // Screen coordinates
      marqueeStartWorld: null,  // World coordinates
      marqueeEnd: null,

      // 3D interaction
      drag3DStart: null,
      drag3DInitialPos: null,
      drag3DGroundStart: null,

      // Dragging
      isDragging: false,
      draggedSymbol: null,
      dragOffset: { x: 0, y: 0 },
      draggingPoint: false,
      draggingWallPoint: false,
      draggingFurnitureHandle: false,
      wallPointSnapTarget: null,
      multiDragStartPos: null,     // Starting position for multi-point drag
      multiDragLastPos: null,      // Last position during multi-point drag

      // Clipboard for copy/paste
      clipboard: null,

      // Wire drawing state
      wirePoints: [],           // Points being drawn for current wire
      isDrawingWire: false,     // Whether actively drawing a wire

      // Defaults
      defaultWallHeight: 96,
      defaultWallThickness: 6,

      // Simplification settings
      simplifyTolerance: 8,    // Douglas-Peucker tolerance

      // Reference image
      referenceImage: null,
      referenceImageMesh: null,
      referenceOpacity: 0.5,
      settingScale: false,
      scalePoint1: null,
      scalePoint2: null,
      pixelsPerInch: 1,        // Scale factor from image to world units

      // Layers visibility
      layers: {
        walls: true,
        openings: true,
        furniture: true,
        dimensions: true,
        annotations: true
      },

      // History for undo/redo
      history: [],
      historyIndex: -1
    };

    // Data structures
    const data = {
      walls: [],
      openings: [],
      furniture: [],
      dimensions: [],
      annotations: [],
      wires: []
    };

    // ============================================
    // THREE.JS SETUP
    // ============================================

    let scene, camera, renderer;
    let gridHelper, axesHelper;
    const canvasContainer = document.getElementById('canvas-container');
    const canvasArea = document.getElementById('canvas-area');
    const labelsContainer = document.getElementById('labels-container');
    const rulerHorizontal = document.getElementById('ruler-horizontal');
    const rulerVertical = document.getElementById('ruler-vertical');

    // Scale factor: 1 unit = 1 inch
    const SCALE = 1;
    const PIXELS_PER_INCH = 4; // For 2D display

    function initThreeJS() {
      // Scene
      scene = new THREE.Scene();
      scene.background = new THREE.Color(state.theme === 'dark' ? 0x0c0c0c : 0xf8f9fa);

      // Camera - Orthographic for 2D, will switch for 3D
      const aspect = canvasArea.clientWidth / canvasArea.clientHeight;
      const frustumSize = 300;
      camera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        2000
      );
      camera.position.set(0, 500, 0);
      camera.lookAt(0, 0, 0);

      // Renderer
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(canvasArea.clientWidth, canvasArea.clientHeight);
      renderer.setPixelRatio(window.devicePixelRatio);
      canvasArea.appendChild(renderer.domElement);

      // Grid
      createGrid();

      // Lights for 3D view
      const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 0.7);
      directionalLight.position.set(200, 400, 200);
      scene.add(directionalLight);

      const directionalLight2 = new THREE.DirectionalLight(0xffffff, 0.3);
      directionalLight2.position.set(-200, 300, -200);
      scene.add(directionalLight2);

      const hemisphereLight = new THREE.HemisphereLight(0xffffbb, 0x080820, 0.3);
      scene.add(hemisphereLight);

      // Start render loop
      animate();
    }

    function createGrid() {
      // Remove existing grid
      if (gridHelper) scene.remove(gridHelper);

      if (state.gridSize === 0) return;

      // Calculate grid size based on camera zoom - infinite grid effect
      // Lower zoom = more zoomed out = larger grid needed
      const baseSize = 600;
      const zoomLevel = camera.zoom || 1;
      const size = Math.max(baseSize, baseSize / zoomLevel * 2);

      // Adjust grid spacing based on zoom level for readability
      let effectiveGridSize = state.gridSize;
      if (zoomLevel < 0.3) {
        effectiveGridSize = state.gridSize * 8; // Very zoomed out - coarser grid
      } else if (zoomLevel < 0.5) {
        effectiveGridSize = state.gridSize * 4; // Zoomed out - coarser grid
      } else if (zoomLevel < 0.8) {
        effectiveGridSize = state.gridSize * 2; // Slightly zoomed out
      }

      const divisions = Math.floor(size / effectiveGridSize);

      // GridHelper creates a grid on the XZ plane (horizontal ground) by default
      gridHelper = new THREE.GridHelper(size, divisions, 0x444444, 0x222222);
      gridHelper.position.y = -0.1;
      scene.add(gridHelper);
    }

    function updateRulers() {
      if (!rulerHorizontal || !rulerVertical || !camera) return;

      // Clear existing rulers
      rulerHorizontal.innerHTML = '';
      rulerVertical.innerHTML = '';

      const canvasRect = canvasArea.getBoundingClientRect();
      const canvasWidth = canvasRect.width;
      const canvasHeight = canvasRect.height;

      // Get world coordinates at canvas edges
      const topLeft = screenToWorld(canvasRect.left, canvasRect.top);
      const bottomRight = screenToWorld(canvasRect.right, canvasRect.bottom);

      const worldWidth = bottomRight.x - topLeft.x;
      const worldHeight = bottomRight.y - topLeft.y;

      // Determine appropriate tick interval based on zoom
      // We want roughly 50-100 pixels between major ticks
      const pixelsPerUnit = canvasWidth / worldWidth;
      let tickInterval;

      if (pixelsPerUnit > 20) {
        tickInterval = 1; // Every inch
      } else if (pixelsPerUnit > 8) {
        tickInterval = 6; // Every 6 inches
      } else if (pixelsPerUnit > 4) {
        tickInterval = 12; // Every foot
      } else if (pixelsPerUnit > 2) {
        tickInterval = 24; // Every 2 feet
      } else if (pixelsPerUnit > 1) {
        tickInterval = 48; // Every 4 feet
      } else if (pixelsPerUnit > 0.5) {
        tickInterval = 96; // Every 8 feet
      } else {
        tickInterval = 120; // Every 10 feet
      }

      // Minor tick interval
      const minorTickInterval = tickInterval / (tickInterval >= 12 ? 4 : 2);

      // Draw horizontal ruler (X axis)
      const startX = Math.floor(topLeft.x / tickInterval) * tickInterval;
      const endX = Math.ceil(bottomRight.x / tickInterval) * tickInterval;

      for (let worldX = startX; worldX <= endX; worldX += minorTickInterval) {
        const screenX = ((worldX - topLeft.x) / worldWidth) * canvasWidth;
        if (screenX < 0 || screenX > canvasWidth) continue;

        const isMajor = Math.abs(worldX % tickInterval) < 0.01;
        const tickHeight = isMajor ? 12 : 6;

        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.left = `${screenX}px`;
        tick.style.height = `${tickHeight}px`;
        rulerHorizontal.appendChild(tick);

        if (isMajor) {
          const label = document.createElement('div');
          label.className = 'ruler-label';
          label.style.left = `${screenX}px`;

          // Format the label
          if (tickInterval >= 12) {
            const feet = Math.round(worldX / 12);
            label.textContent = `${feet}'`;
          } else {
            label.textContent = `${Math.round(worldX)}"`;
          }

          rulerHorizontal.appendChild(label);
        }
      }

      // Draw vertical ruler (Y axis) - note Y increases downward in world coords
      const startY = Math.floor(topLeft.y / tickInterval) * tickInterval;
      const endY = Math.ceil(bottomRight.y / tickInterval) * tickInterval;

      for (let worldY = startY; worldY <= endY; worldY += minorTickInterval) {
        const screenY = ((worldY - topLeft.y) / worldHeight) * canvasHeight;
        if (screenY < 0 || screenY > canvasHeight) continue;

        const isMajor = Math.abs(worldY % tickInterval) < 0.01;
        const tickWidth = isMajor ? 12 : 6;

        const tick = document.createElement('div');
        tick.className = 'ruler-tick';
        tick.style.top = `${screenY}px`;
        tick.style.width = `${tickWidth}px`;
        rulerVertical.appendChild(tick);

        if (isMajor) {
          const label = document.createElement('div');
          label.className = 'ruler-label';
          label.style.top = `${screenY}px`;

          // Format the label
          if (tickInterval >= 12) {
            const feet = Math.round(worldY / 12);
            label.textContent = `${feet}'`;
          } else {
            label.textContent = `${Math.round(worldY)}"`;
          }

          rulerVertical.appendChild(label);
        }
      }

      // Update corner unit indicator
      const corner = document.getElementById('ruler-corner');
      if (corner) {
        corner.textContent = tickInterval >= 12 ? 'ft' : 'in';
      }
    }

    function animate() {
      requestAnimationFrame(animate);
      renderer.render(scene, camera);
    }

    // ============================================
    // COORDINATE CONVERSION
    // ============================================

    function screenToWorld(screenX, screenY) {
      const rect = renderer.domElement.getBoundingClientRect();
      const x = ((screenX - rect.left) / rect.width) * 2 - 1;
      const y = -((screenY - rect.top) / rect.height) * 2 + 1;

      const vector = new THREE.Vector3(x, y, 0);
      vector.unproject(camera);

      // For orthographic camera, project onto XZ plane (Y=0)
      if (state.currentView === '2d') {
        return { x: vector.x, y: vector.z };
      } else {
        // For 3D, raycast to ground plane
        const raycaster = new THREE.Raycaster();
        raycaster.setFromCamera(new THREE.Vector2(x, y), camera);
        const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
        const intersection = new THREE.Vector3();
        raycaster.ray.intersectPlane(plane, intersection);
        return { x: intersection.x, y: intersection.z };
      }
    }

    function worldToScreen(worldX, worldY) {
      const vector = new THREE.Vector3(worldX, 0, worldY);
      vector.project(camera);

      const rect = renderer.domElement.getBoundingClientRect();
      return {
        x: (vector.x + 1) / 2 * rect.width + rect.left,
        y: (-vector.y + 1) / 2 * rect.height + rect.top
      };
    }

    function snapToGrid(value) {
      if (state.gridSize === 0) return value;
      return Math.round(value / state.gridSize) * state.gridSize;
    }

    function snapPointToGrid(point) {
      return {
        x: snapToGrid(point.x),
        y: snapToGrid(point.y)
      };
    }

    // Snap to horizontal/vertical alignment with other wall endpoints
    function snapToHVAlignment(point, excludeWalls = []) {
      const threshold = 8; // Snap threshold in world units
      let snappedPoint = { x: point.x, y: point.y };
      let snappedX = false;
      let snappedY = false;

      // Check all wall endpoints for alignment
      for (const wall of data.walls) {
        if (excludeWalls.includes(wall)) continue;

        const endpoints = [wall.start, wall.end];
        for (const ep of endpoints) {
          // Check horizontal alignment (same Y)
          if (!snappedY && Math.abs(point.y - ep.y) < threshold) {
            snappedPoint.y = ep.y;
            snappedY = true;
          }
          // Check vertical alignment (same X)
          if (!snappedX && Math.abs(point.x - ep.x) < threshold) {
            snappedPoint.x = ep.x;
            snappedX = true;
          }
        }

        if (snappedX && snappedY) break;
      }

      return { point: snappedPoint, snappedX, snappedY };
    }

    // Combined snap: grid + H/V alignment (H/V takes priority when close)
    function snapPointWithHVAlignment(point, excludeWalls = []) {
      // First apply grid snap
      let snapped = snapPointToGrid(point);

      // Then check for H/V alignment (overrides grid snap if closer)
      const hvResult = snapToHVAlignment(point, excludeWalls);

      if (hvResult.snappedX) {
        snapped.x = hvResult.point.x;
      }
      if (hvResult.snappedY) {
        snapped.y = hvResult.point.y;
      }

      return snapped;
    }

    // ============================================
    // MEASUREMENT FORMATTING
    // ============================================

    function formatMeasurement(inches) {
      if (state.unit === 'cm') {
        const cm = inches * 2.54;
        return `${cm.toFixed(1)} cm`;
      } else {
        const feet = Math.floor(inches / 12);
        const remainingInches = inches % 12;
        if (feet > 0) {
          if (remainingInches === 0) {
            return `${feet}'`;
          }
          return `${feet}' ${remainingInches.toFixed(1)}"`;
        }
        return `${inches.toFixed(1)}"`;
      }
    }

    function calculateDistance(p1, p2) {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy);
    }

    // ============================================
    // DOUGLAS-PEUCKER LINE SIMPLIFICATION
    // ============================================

    function perpendicularDistance(point, lineStart, lineEnd) {
      const dx = lineEnd.x - lineStart.x;
      const dy = lineEnd.y - lineStart.y;

      if (dx === 0 && dy === 0) {
        return calculateDistance(point, lineStart);
      }

      const t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / (dx * dx + dy * dy);

      if (t < 0) {
        return calculateDistance(point, lineStart);
      } else if (t > 1) {
        return calculateDistance(point, lineEnd);
      }

      const projection = {
        x: lineStart.x + t * dx,
        y: lineStart.y + t * dy
      };

      return calculateDistance(point, projection);
    }

    function douglasPeucker(points, tolerance) {
      if (points.length <= 2) {
        return points.map(p => ({ ...p }));
      }

      // Find the point with maximum distance
      let maxDistance = 0;
      let maxIndex = 0;

      const start = points[0];
      const end = points[points.length - 1];

      for (let i = 1; i < points.length - 1; i++) {
        const distance = perpendicularDistance(points[i], start, end);
        if (distance > maxDistance) {
          maxDistance = distance;
          maxIndex = i;
        }
      }

      // If max distance is greater than tolerance, recursively simplify
      if (maxDistance > tolerance) {
        const left = douglasPeucker(points.slice(0, maxIndex + 1), tolerance);
        const right = douglasPeucker(points.slice(maxIndex), tolerance);

        // Concatenate results (remove duplicate point)
        return left.slice(0, -1).concat(right);
      } else {
        // Return just the endpoints
        return [{ ...start }, { ...end }];
      }
    }

    function simplifyPath(points, tolerance = 8) {
      if (points.length < 2) return points;

      // Apply Douglas-Peucker algorithm
      let simplified = douglasPeucker(points, tolerance);

      // Snap points to grid
      simplified = simplified.map(p => snapPointToGrid(p));

      // Remove duplicate consecutive points
      const result = [simplified[0]];
      for (let i = 1; i < simplified.length; i++) {
        const prev = result[result.length - 1];
        if (calculateDistance(prev, simplified[i]) > 2) {
          result.push(simplified[i]);
        }
      }

      return result;
    }

    // ============================================
    // WALL CLASS
    // ============================================

    class Wall {
      constructor(start, end, thickness = 6, height = 96) {
        this.id = Date.now() + Math.random();
        this.start = { ...start };
        this.end = { ...end };
        this.thickness = thickness;
        this.height = height;
        this.openings = [];
        this.mesh = null;
        this.mesh3D = null;
        this.selected = false;
        this.dimensionLabel = null;  // Engineering dimension label
      }

      get length() {
        return calculateDistance(this.start, this.end);
      }

      get angle() {
        return Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
      }

      get midpoint() {
        return {
          x: (this.start.x + this.end.x) / 2,
          y: (this.start.y + this.end.y) / 2
        };
      }

      // Get perpendicular vector (normalized)
      get perpendicular() {
        const dx = this.end.x - this.start.x;
        const dy = this.end.y - this.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        return { x: -dy / len, y: dx / len };
      }

      // Check if a point is near this wall
      distanceToPoint(point) {
        const A = point.x - this.start.x;
        const B = point.y - this.start.y;
        const C = this.end.x - this.start.x;
        const D = this.end.y - this.start.y;

        const dot = A * C + B * D;
        const lenSq = C * C + D * D;
        let param = -1;

        if (lenSq !== 0) param = dot / lenSq;

        let xx, yy;

        if (param < 0) {
          xx = this.start.x;
          yy = this.start.y;
        } else if (param > 1) {
          xx = this.end.x;
          yy = this.end.y;
        } else {
          xx = this.start.x + param * C;
          yy = this.start.y + param * D;
        }

        const dx = point.x - xx;
        const dy = point.y - yy;

        return {
          distance: Math.sqrt(dx * dx + dy * dy),
          param: Math.max(0, Math.min(1, param)),
          point: { x: xx, y: yy }
        };
      }

      // Create 2D mesh
      create2DMesh() {
        if (this.mesh) {
          scene.remove(this.mesh);
        }
        if (this.dimensionLabel) {
          this.dimensionLabel.remove();
        }

        const length = this.length;
        const halfThickness = this.thickness / 2;

        // Create wall shape
        const shape = new THREE.Shape();
        shape.moveTo(0, -halfThickness);
        shape.lineTo(length, -halfThickness);
        shape.lineTo(length, halfThickness);
        shape.lineTo(0, halfThickness);
        shape.lineTo(0, -halfThickness);

        // Add holes for openings
        this.openings.forEach(opening => {
          const openingStart = opening.position * length - opening.width / 2;
          const openingEnd = opening.position * length + opening.width / 2;

          const hole = new THREE.Path();
          hole.moveTo(openingStart, -halfThickness - 1);
          hole.lineTo(openingEnd, -halfThickness - 1);
          hole.lineTo(openingEnd, halfThickness + 1);
          hole.lineTo(openingStart, halfThickness + 1);
          hole.lineTo(openingStart, -halfThickness - 1);
          shape.holes.push(hole);
        });

        const geometry = new THREE.ShapeGeometry(shape);
        const material = new THREE.MeshBasicMaterial({
          color: this.selected ? 0xff006e : 0x00d4ff,
          side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.position.set(this.start.x, 0, this.start.y);
        this.mesh.rotation.z = -this.angle;
        this.mesh.userData = { type: 'wall', id: this.id };

        scene.add(this.mesh);

        // Create engineering-style dimension label
        this.createDimensionLabel();

        return this.mesh;
      }

      createDimensionLabel() {
        if (this.dimensionLabel) {
          this.dimensionLabel.remove();
        }

        const length = this.length;
        if (length < 12) return; // Don't show labels for very short walls

        this.dimensionLabel = document.createElement('div');
        this.dimensionLabel.className = 'wall-dimension-label';
        this.dimensionLabel.textContent = formatMeasurement(length);
        this.dimensionLabel.title = 'Click to edit length';

        // Add click handler for editing
        const wall = this;
        this.dimensionLabel.addEventListener('click', (e) => {
          e.stopPropagation();
          editWallLength(wall);
        });

        labelsContainer.appendChild(this.dimensionLabel);

        this.updateDimensionLabel();
      }

      updateDimensionLabel() {
        if (!this.dimensionLabel) return;

        const mid = this.midpoint;
        const perp = this.perpendicular;

        // Position label centered on the wall line (CAD style)
        // Offset slightly in perpendicular direction so it doesn't overlap the wall
        const offsetDist = this.thickness / 2 + 8;
        const labelPos = {
          x: mid.x + perp.x * offsetDist,
          y: mid.y + perp.y * offsetDist
        };

        const screenPos = worldToScreen(labelPos.x, labelPos.y);
        const rect = canvasContainer.getBoundingClientRect();

        // Calculate rotation angle for the label (align with wall)
        let angleDeg = (this.angle * 180 / Math.PI);
        // Keep text readable (not upside down)
        if (angleDeg > 90 || angleDeg < -90) {
          angleDeg += 180;
        }

        this.dimensionLabel.style.left = `${screenPos.x - rect.left}px`;
        this.dimensionLabel.style.top = `${screenPos.y - rect.top}px`;
        this.dimensionLabel.style.transform = `translate(-50%, -50%) rotate(${angleDeg}deg)`;

        // Update the text content in case length changed
        this.dimensionLabel.textContent = formatMeasurement(this.length);
      }

      // Create 3D mesh
      create3DMesh() {
        if (this.mesh3D) {
          scene.remove(this.mesh3D);
          this.mesh3D = null;
        }

        const length = this.length;
        if (length < 1) return null;

        const halfThickness = this.thickness / 2;

        // Create a group to hold the wall mesh and edges
        const group = new THREE.Group();

        // Create wall shape for extrusion
        const shape = new THREE.Shape();
        shape.moveTo(0, 0);
        shape.lineTo(length, 0);
        shape.lineTo(length, this.height);
        shape.lineTo(0, this.height);
        shape.lineTo(0, 0);

        // Add holes for openings
        this.openings.forEach(opening => {
          const openingStart = Math.max(1, opening.position * length - opening.width / 2);
          const openingEnd = Math.min(length - 1, opening.position * length + opening.width / 2);
          const bottomY = opening.type.startsWith('window') ? opening.sillHeight : 0;
          const topY = Math.min(this.height - 1, bottomY + opening.height);

          if (openingEnd > openingStart && topY > bottomY) {
            const hole = new THREE.Path();
            hole.moveTo(openingStart, bottomY);
            hole.lineTo(openingEnd, bottomY);
            hole.lineTo(openingEnd, topY);
            hole.lineTo(openingStart, topY);
            hole.lineTo(openingStart, bottomY);
            shape.holes.push(hole);
          }
        });

        const extrudeSettings = {
          depth: this.thickness,
          bevelEnabled: false
        };

        const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

        // Use MeshStandardMaterial for better 3D appearance
        const material = new THREE.MeshStandardMaterial({
          color: this.selected ? 0xff006e : 0x00a8cc,
          side: THREE.DoubleSide,
          roughness: 0.6,
          metalness: 0.2
        });

        const mesh = new THREE.Mesh(geometry, material);
        group.add(mesh);

        // Add edges for better visibility
        const edgesGeometry = new THREE.EdgesGeometry(geometry, 15);
        const edgesMaterial = new THREE.LineBasicMaterial({
          color: this.selected ? 0xff006e : 0x00d4ff,
          linewidth: 1
        });
        const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
        group.add(edges);

        // Position and rotate
        group.position.set(this.start.x, 0, this.start.y);
        group.rotation.y = -this.angle;
        group.translateZ(-halfThickness);

        group.userData = { type: 'wall', id: this.id };

        this.mesh3D = group;
        scene.add(group);
        return group;
      }

      remove() {
        if (this.mesh) scene.remove(this.mesh);
        if (this.mesh3D) scene.remove(this.mesh3D);
        if (this.dimensionLabel) this.dimensionLabel.remove();
      }

      setSelected(selected) {
        this.selected = selected;
        if (state.currentView === '2d' && this.mesh) {
          this.mesh.material.color.setHex(selected ? 0xff006e : 0x00d4ff);
        }
        if (state.currentView === '3d' && this.mesh3D) {
          // mesh3D is a group, update the first child (the mesh)
          if (this.mesh3D.children && this.mesh3D.children[0]) {
            this.mesh3D.children[0].material.color.setHex(selected ? 0xff006e : 0x00a8cc);
          }
        }
      }
    }

    // ============================================
    // OPENING CLASS
    // ============================================

    class Opening {
      constructor(type, wall, position, width, height, sillHeight = 0) {
        this.id = Date.now() + Math.random();
        this.type = type; // 'door-single', 'door-double', 'window-single', etc.
        this.wall = wall;
        this.position = position; // 0-1 along wall
        this.width = width;
        this.height = height;
        this.sillHeight = sillHeight;
        this.mesh = null;
        this.selected = false;
      }

      get worldPosition() {
        const wall = this.wall;
        const dx = wall.end.x - wall.start.x;
        const dy = wall.end.y - wall.start.y;
        return {
          x: wall.start.x + dx * this.position,
          y: wall.start.y + dy * this.position
        };
      }

      create2DMesh() {
        if (this.mesh) scene.remove(this.mesh);

        const pos = this.worldPosition;
        const wall = this.wall;
        const angle = wall.angle;
        const halfWidth = this.width / 2;
        const halfThickness = wall.thickness / 2 + 2;

        const group = new THREE.Group();

        // Opening rectangle
        const geometry = new THREE.PlaneGeometry(this.width, wall.thickness + 4);
        const color = this.type.startsWith('door') ? 0xff6b35 : 0x4ecdc4;
        const material = new THREE.MeshBasicMaterial({
          color: this.selected ? 0xff006e : color,
          side: THREE.DoubleSide
        });
        const rect = new THREE.Mesh(geometry, material);
        group.add(rect);

        // Door swing indicator
        if (this.type === 'door-single') {
          const curvePoints = [];
          for (let i = 0; i <= 20; i++) {
            const angle = (i / 20) * Math.PI / 2;
            curvePoints.push(new THREE.Vector3(
              -halfWidth + Math.cos(angle) * this.width,
              Math.sin(angle) * this.width,
              0
            ));
          }
          const curveGeometry = new THREE.BufferGeometry().setFromPoints(curvePoints);
          const curveMaterial = new THREE.LineBasicMaterial({ color: 0xff6b35 });
          const curve = new THREE.Line(curveGeometry, curveMaterial);
          curve.position.y = halfThickness;
          group.add(curve);
        } else if (this.type === 'door-double') {
          // Left swing
          const leftCurvePoints = [];
          for (let i = 0; i <= 10; i++) {
            const angle = (i / 10) * Math.PI / 2;
            leftCurvePoints.push(new THREE.Vector3(
              -halfWidth + Math.cos(angle) * halfWidth,
              Math.sin(angle) * halfWidth,
              0
            ));
          }
          const leftCurveGeometry = new THREE.BufferGeometry().setFromPoints(leftCurvePoints);
          const leftCurveMaterial = new THREE.LineBasicMaterial({ color: 0xff6b35 });
          const leftCurve = new THREE.Line(leftCurveGeometry, leftCurveMaterial);
          leftCurve.position.y = halfThickness;
          group.add(leftCurve);

          // Right swing
          const rightCurvePoints = [];
          for (let i = 0; i <= 10; i++) {
            const angle = (i / 10) * Math.PI / 2;
            rightCurvePoints.push(new THREE.Vector3(
              halfWidth - Math.cos(angle) * halfWidth,
              Math.sin(angle) * halfWidth,
              0
            ));
          }
          const rightCurveGeometry = new THREE.BufferGeometry().setFromPoints(rightCurvePoints);
          const rightCurveMaterial = new THREE.LineBasicMaterial({ color: 0xff6b35 });
          const rightCurve = new THREE.Line(rightCurveGeometry, rightCurveMaterial);
          rightCurve.position.y = halfThickness;
          group.add(rightCurve);
        }

        group.position.set(pos.x, 0.5, pos.y);
        group.rotation.x = -Math.PI / 2;
        group.rotation.z = -angle;
        group.userData = { type: 'opening', id: this.id };

        this.mesh = group;
        scene.add(group);
        return group;
      }

      remove() {
        if (this.mesh) scene.remove(this.mesh);
      }

      setSelected(selected) {
        this.selected = selected;
        if (this.mesh) {
          const color = this.type.startsWith('door') ? 0xff6b35 : 0x4ecdc4;
          this.mesh.children[0].material.color.setHex(selected ? 0xff006e : color);
        }
      }
    }

    // ============================================
    // FURNITURE CLASS
    // ============================================

    class Furniture {
      constructor(type, position, width, depth, height = 30) {
        this.id = Date.now() + Math.random();
        this.type = type;
        this.position = { ...position };
        this.width = width;
        this.depth = depth;
        this.height = height;
        this.rotation = 0;
        this.mesh = null;
        this.mesh3D = null;
        this.selected = false;
        this.label = '';
        this.labelDiv = null;
      }

      isCircular() {
        // Types that should render as circular shapes
        const circularTypes = ['table-round', 'dining-table-round', 'bar-stool', 'dust-collector'];
        return circularTypes.includes(this.type);
      }

      create2DMesh() {
        if (this.mesh) scene.remove(this.mesh);
        if (this.labelDiv) this.labelDiv.remove();

        let geometry;
        if (this.isCircular()) {
          geometry = new THREE.CircleGeometry(this.width / 2, 32);
        } else {
          geometry = new THREE.PlaneGeometry(this.width, this.depth);
        }

        const material = new THREE.MeshBasicMaterial({
          color: this.selected ? 0xff006e : 0x95d5b2,
          side: THREE.DoubleSide
        });

        this.mesh = new THREE.Mesh(geometry, material);
        this.mesh.position.set(this.position.x, 0.2, this.position.y);
        this.mesh.rotation.x = -Math.PI / 2;
        this.mesh.rotation.z = this.rotation;
        this.mesh.userData = { type: 'furniture', id: this.id };

        scene.add(this.mesh);

        // Create label if set
        if (this.label) {
          this.createLabel();
        }

        return this.mesh;
      }

      createLabel() {
        if (this.labelDiv) this.labelDiv.remove();
        if (!this.label) return;

        this.labelDiv = document.createElement('div');
        this.labelDiv.className = 'furniture-label';
        this.labelDiv.textContent = this.label;
        this.labelDiv.style.cssText = `
          position: absolute;
          background: rgba(0, 0, 0, 0.8);
          color: #fff;
          padding: 2px 6px;
          font-size: 11px;
          border-radius: 3px;
          pointer-events: none;
          white-space: nowrap;
          transform: translate(-50%, -50%);
          z-index: 50;
        `;
        labelsContainer.appendChild(this.labelDiv);
        this.updateLabelPosition();
      }

      updateLabelPosition() {
        if (!this.labelDiv) return;
        const screenPos = worldToScreen(this.position.x, this.position.y);
        this.labelDiv.style.left = `${screenPos.x}px`;
        this.labelDiv.style.top = `${screenPos.y}px`;
      }

      create3DMesh() {
        if (this.mesh3D) scene.remove(this.mesh3D);

        const group = new THREE.Group();
        const baseColor = this.selected ? 0xff006e : this.get3DColor();

        // Create different 3D models based on furniture type
        if (this.type.startsWith('bed')) {
          this.createBed3D(group, baseColor);
        } else if (this.type === 'table-round' || this.type === 'dining-table-round') {
          this.createRoundTable3D(group, baseColor);
        } else if (this.type === 'table-rect' || this.type === 'desk') {
          this.createRectTable3D(group, baseColor);
        } else if (this.type === 'sofa' || this.type === 'loveseat') {
          this.createSofa3D(group, baseColor);
        } else if (this.type === 'chair' || this.type === 'dining-chair' || this.type === 'armchair') {
          this.createChair3D(group, baseColor);
        } else if (this.type === 'bar-stool') {
          this.createBarStool3D(group, baseColor);
        } else if (this.type === 'counter-stool') {
          this.createCounterStool3D(group, baseColor);
        } else if (this.type === 'toilet') {
          this.createToilet3D(group, baseColor);
        } else if (this.type === 'bathtub') {
          this.createBathtub3D(group, baseColor);
        } else if (this.type === 'sink' || this.type === 'vanity') {
          this.createSink3D(group, baseColor);
        } else if (this.type === 'refrigerator') {
          this.createRefrigerator3D(group, baseColor);
        } else if (this.type === 'stove') {
          this.createStove3D(group, baseColor);
        } else if (this.type === 'nightstand' || this.type === 'side-table') {
          this.createNightstand3D(group, baseColor);
        } else if (this.type === 'dresser') {
          this.createDresser3D(group, baseColor);
        } else if (this.type === 'bookshelf' || this.type === 'storage-shelf') {
          this.createBookshelf3D(group, baseColor);
        } else if (this.type === 'coffee-table') {
          this.createCoffeeTable3D(group, baseColor);
        } else if (this.type === 'workbench' || this.type === 'assembly-table' || this.type === 'packing-table') {
          this.createWorkbench3D(group, baseColor);
        } else if (this.type === 'tool-chest') {
          this.createToolChest3D(group, baseColor);
        } else if (this.type === 'lathe') {
          this.createLathe3D(group, baseColor);
        } else if (this.type === 'mill') {
          this.createMill3D(group, baseColor);
        } else if (this.type === 'drill-press') {
          this.createDrillPress3D(group, baseColor);
        } else if (this.type === 'bandsaw') {
          this.createBandsaw3D(group, baseColor);
        } else if (this.type === 'table-saw') {
          this.createTableSaw3D(group, baseColor);
        } else if (this.type === 'grinder') {
          this.createGrinder3D(group, baseColor);
        } else if (this.type === 'cnc-router') {
          this.createCNCRouter3D(group, baseColor);
        } else if (this.type === 'welder' || this.type === 'welding-table') {
          this.createWeldingStation3D(group, baseColor);
        } else if (this.type === 'outfeed-table') {
          this.createOutfeedTable3D(group, baseColor);
        // Storage
        } else if (this.type === 'shelving' || this.type === 'storage-shelf') {
          this.createShelving3D(group, baseColor);
        } else if (this.type === 'cabinet') {
          this.createCabinet3D(group, baseColor);
        } else if (this.type === 'pallet-rack') {
          this.createPalletRack3D(group, baseColor);
        } else if (this.type === 'bin-rack') {
          this.createBinRack3D(group, baseColor);
        } else if (this.type === 'lumber-rack') {
          this.createLumberRack3D(group, baseColor);
        // Equipment
        } else if (this.type === 'air-compressor') {
          this.createAirCompressor3D(group, baseColor);
        } else if (this.type === 'dust-collector') {
          this.createDustCollector3D(group, baseColor);
        } else if (this.type === 'vise') {
          this.createVise3D(group, baseColor);
        } else if (this.type === 'hydraulic-press') {
          this.createHydraulicPress3D(group, baseColor);
        } else if (this.type === 'forklift') {
          this.createForklift3D(group, baseColor);
        } else if (this.type === 'hand-truck') {
          this.createHandTruck3D(group, baseColor);
        } else if (this.type === 'waterjet') {
          this.createWaterjet3D(group, baseColor);
        } else if (this.type === 'sandblaster') {
          this.createSandblaster3D(group, baseColor);
        } else if (this.type === 'air-manifold') {
          this.createAirManifold3D(group, baseColor);
        // Additional items
        } else if (this.type === 'office-chair') {
          this.createOfficeChair3D(group, baseColor);
        } else if (this.type === 'shop-sink') {
          this.createShopSink3D(group, baseColor);
        } else if (this.type === 'hot-water-heater') {
          this.createHotWaterHeater3D(group, baseColor);
        } else if (this.type === 'motorcycle') {
          this.createMotorcycle3D(group, baseColor);
        // Electrical items
        } else if (this.type === 'electrical-panel') {
          this.createElectricalPanel3D(group, baseColor);
        } else if (this.type === 'junction-box') {
          this.createJunctionBox3D(group, baseColor);
        } else if (this.type === 'outlet') {
          this.createOutlet3D(group, baseColor);
        } else if (this.type === 'light-switch') {
          this.createLightSwitch3D(group, baseColor);
        } else {
          // Default box
          this.createDefaultBox3D(group, baseColor);
        }

        group.position.set(this.position.x, 0, this.position.y);
        group.rotation.y = this.rotation;
        group.userData = { type: 'furniture', id: this.id };

        this.mesh3D = group;
        this.mesh3D.renderOrder = 0;

        scene.add(this.mesh3D);
        return this.mesh3D;
      }

      get3DColor() {
        const colors = {
          'bed': 0x8B4513,      // Brown for wood frame
          'sofa': 0x4a6741,     // Green fabric
          'chair': 0x8B4513,    // Brown wood
          'stool': 0x8B4513,    // Brown wood
          'table': 0xDEB887,    // Burlywood
          'desk': 0x8B4513,     // Brown wood
          'toilet': 0xffffff,   // White porcelain
          'bathtub': 0xffffff,  // White
          'sink': 0xffffff,     // White
          'refrigerator': 0xc0c0c0, // Silver
          'stove': 0x2f2f2f,    // Dark gray
          'nightstand': 0x8B4513,
          'dresser': 0x8B4513,
          'bookshelf': 0x8B4513,
          // Workshop colors
          'workbench': 0x8B4513, // Brown wood
          'tool-chest': 0xcc0000, // Red (typical Snap-on/MAC style)
          'lathe': 0x4a5568,    // Industrial gray
          'mill': 0x4a5568,     // Industrial gray
          'drill-press': 0x4a5568, // Industrial gray
          'bandsaw': 0x4a5568,  // Industrial gray
          'table-saw': 0x4a5568, // Industrial gray
          'grinder': 0x4a5568,  // Industrial gray
          'cnc-router': 0x4a5568, // Industrial gray
          'welder': 0x2563eb,   // Blue (typical Miller/Lincoln)
          'welding-table': 0x374151, // Dark steel
          'assembly-table': 0x8B4513, // Wood
          'outfeed-table': 0x8B4513, // Wood
          'packing-table': 0x8B4513, // Wood
          'storage-shelf': 0x4a5568, // Metal gray
          // Storage colors
          'shelving': 0x4a5568,      // Metal gray
          'cabinet': 0x6b7280,       // Gray
          'pallet-rack': 0xf59e0b,   // Orange/yellow
          'bin-rack': 0x6b7280,      // Gray
          'lumber-rack': 0xf59e0b,   // Orange
          // Equipment colors
          'air-compressor': 0xcc0000, // Red
          'dust-collector': 0x6b7280, // Gray
          'vise': 0x4a5568,          // Dark metal
          'hydraulic-press': 0xcc0000, // Red
          'forklift': 0xfbbf24,      // Yellow
          'hand-truck': 0x6b7280,    // Gray
          'waterjet': 0x3b82f6,      // Blue
          'sandblaster': 0x6b7280,   // Gray
          'air-manifold': 0x3b82f6,  // Blue
          // Additional items
          'office-chair': 0x1f2937,  // Dark gray/black
          'shop-sink': 0xc0c0c0,     // Stainless steel
          'hot-water-heater': 0xf5f5f5, // White/off-white
          'motorcycle': 0x1a1a1a,    // Black (Royal Enfield)
          // Electrical items
          'electrical-panel': 0x4b5563, // Dark gray metal
          'junction-box': 0x6b7280,     // Gray metal
          'outlet': 0xf5f5f5,           // White plastic
          'light-switch': 0xf5f5f5      // White plastic
        };
        for (const [key, color] of Object.entries(colors)) {
          if (this.type.includes(key)) return color;
        }
        return 0x95d5b2; // Default green
      }

      createDefaultBox3D(group, color) {
        const geometry = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const material = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.y = this.height / 2;
        group.add(mesh);
      }

      createBed3D(group, color) {
        // Bed frame
        const frameHeight = 6;
        const frameGeo = new THREE.BoxGeometry(this.width, frameHeight, this.depth);
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
        const frame = new THREE.Mesh(frameGeo, frameMat);
        frame.position.y = frameHeight / 2;
        group.add(frame);

        // Mattress
        const mattressHeight = 10;
        const mattressGeo = new THREE.BoxGeometry(this.width - 2, mattressHeight, this.depth - 2);
        const mattressMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.9 });
        const mattress = new THREE.Mesh(mattressGeo, mattressMat);
        mattress.position.y = frameHeight + mattressHeight / 2;
        group.add(mattress);

        // Headboard
        const headboardGeo = new THREE.BoxGeometry(this.width, 24, 3);
        const headboard = new THREE.Mesh(headboardGeo, frameMat);
        headboard.position.set(0, 18, -this.depth / 2 + 1.5);
        group.add(headboard);

        // Pillows
        const pillowGeo = new THREE.BoxGeometry(18, 4, 12);
        const pillowMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 });
        const pillow1 = new THREE.Mesh(pillowGeo, pillowMat);
        pillow1.position.set(-this.width / 4, frameHeight + mattressHeight + 2, -this.depth / 3);
        group.add(pillow1);
        if (this.width > 45) {
          const pillow2 = new THREE.Mesh(pillowGeo, pillowMat);
          pillow2.position.set(this.width / 4, frameHeight + mattressHeight + 2, -this.depth / 3);
          group.add(pillow2);
        }
      }

      createRoundTable3D(group, color) {
        // Tabletop
        const topGeo = new THREE.CylinderGeometry(this.width / 2, this.width / 2, 2, 32);
        const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = this.height;
        group.add(top);

        // Center pedestal
        const legGeo = new THREE.CylinderGeometry(3, 4, this.height - 2, 16);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 });
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.y = (this.height - 2) / 2;
        group.add(leg);
      }

      createRectTable3D(group, color) {
        // Tabletop
        const topGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const topMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const top = new THREE.Mesh(topGeo, topMat);
        top.position.y = this.height;
        group.add(top);

        // Legs
        const legGeo = new THREE.BoxGeometry(2, this.height - 2, 2);
        const legMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.7 });
        const positions = [
          [-this.width / 2 + 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [this.width / 2 - 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [-this.width / 2 + 3, (this.height - 2) / 2, this.depth / 2 - 3],
          [this.width / 2 - 3, (this.height - 2) / 2, this.depth / 2 - 3]
        ];
        positions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, legMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createSofa3D(group, color) {
        const seatHeight = 16;
        const seatDepth = this.depth * 0.7;
        const backHeight = 16;
        const armWidth = 6;

        // Seat
        const seatGeo = new THREE.BoxGeometry(this.width - armWidth * 2, seatHeight, seatDepth);
        const fabricMat = new THREE.MeshStandardMaterial({ color, roughness: 0.9 });
        const seat = new THREE.Mesh(seatGeo, fabricMat);
        seat.position.set(0, seatHeight / 2, (this.depth - seatDepth) / 2);
        group.add(seat);

        // Back
        const backGeo = new THREE.BoxGeometry(this.width - armWidth * 2, backHeight, 6);
        const back = new THREE.Mesh(backGeo, fabricMat);
        back.position.set(0, seatHeight + backHeight / 2, -this.depth / 2 + 3);
        group.add(back);

        // Arms
        const armGeo = new THREE.BoxGeometry(armWidth, seatHeight + 4, this.depth);
        const armMat = new THREE.MeshStandardMaterial({ color: 0x3d5c3d, roughness: 0.8 });
        const leftArm = new THREE.Mesh(armGeo, armMat);
        leftArm.position.set(-this.width / 2 + armWidth / 2, (seatHeight + 4) / 2, 0);
        group.add(leftArm);
        const rightArm = new THREE.Mesh(armGeo, armMat);
        rightArm.position.set(this.width / 2 - armWidth / 2, (seatHeight + 4) / 2, 0);
        group.add(rightArm);

        // Cushions
        const cushionWidth = (this.width - armWidth * 2) / (this.type === 'loveseat' ? 2 : 3);
        const cushionGeo = new THREE.BoxGeometry(cushionWidth - 2, 4, seatDepth - 4);
        const cushionMat = new THREE.MeshStandardMaterial({ color: 0x5a7a52, roughness: 0.9 });
        const numCushions = this.type === 'loveseat' ? 2 : 3;
        for (let i = 0; i < numCushions; i++) {
          const cushion = new THREE.Mesh(cushionGeo, cushionMat);
          const x = -this.width / 2 + armWidth + cushionWidth / 2 + i * cushionWidth;
          cushion.position.set(x, seatHeight + 2, (this.depth - seatDepth) / 2);
          group.add(cushion);
        }
      }

      createChair3D(group, color) {
        const seatHeight = 18;
        const seatThickness = 2;

        // Seat
        const seatGeo = new THREE.BoxGeometry(this.width, seatThickness, this.depth);
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const seat = new THREE.Mesh(seatGeo, woodMat);
        seat.position.y = seatHeight;
        group.add(seat);

        // Back
        if (this.type !== 'dining-chair') {
          const backGeo = new THREE.BoxGeometry(this.width, 14, 2);
          const back = new THREE.Mesh(backGeo, woodMat);
          back.position.set(0, seatHeight + 8, -this.depth / 2 + 1);
          group.add(back);
        }

        // Legs
        const legGeo = new THREE.CylinderGeometry(1, 1, seatHeight, 8);
        const positions = [
          [-this.width / 2 + 2, seatHeight / 2, -this.depth / 2 + 2],
          [this.width / 2 - 2, seatHeight / 2, -this.depth / 2 + 2],
          [-this.width / 2 + 2, seatHeight / 2, this.depth / 2 - 2],
          [this.width / 2 - 2, seatHeight / 2, this.depth / 2 - 2]
        ];
        positions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, woodMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createBarStool3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.3, metalness: 0.7 });
        const seatMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

        // Round seat (circular)
        const seatGeo = new THREE.CylinderGeometry(this.width / 2, this.width / 2, 2, 24);
        const seat = new THREE.Mesh(seatGeo, seatMat);
        seat.position.y = this.height;
        group.add(seat);

        // Center post
        const postGeo = new THREE.CylinderGeometry(1.5, 1.5, this.height - 6, 12);
        const post = new THREE.Mesh(postGeo, metalMat);
        post.position.y = (this.height - 6) / 2 + 4;
        group.add(post);

        // Footrest ring
        const footrestGeo = new THREE.TorusGeometry(6, 0.5, 8, 24);
        const footrest = new THREE.Mesh(footrestGeo, metalMat);
        footrest.rotation.x = Math.PI / 2;
        footrest.position.y = this.height * 0.35;
        group.add(footrest);

        // Base (circular)
        const baseGeo = new THREE.CylinderGeometry(8, 8, 2, 24);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = 1;
        group.add(base);
      }

      createCounterStool3D(group, color) {
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.3, metalness: 0.6 });

        // Seat
        const seatGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const seat = new THREE.Mesh(seatGeo, woodMat);
        seat.position.y = this.height;
        group.add(seat);

        // Back (short)
        const backGeo = new THREE.BoxGeometry(this.width, 8, 2);
        const back = new THREE.Mesh(backGeo, woodMat);
        back.position.set(0, this.height + 5, -this.depth / 2 + 1);
        group.add(back);

        // Legs (4 legs, slightly angled look)
        const legGeo = new THREE.CylinderGeometry(1, 1.2, this.height - 2, 8);
        const positions = [
          [-this.width / 2 + 2, (this.height - 2) / 2, -this.depth / 2 + 2],
          [this.width / 2 - 2, (this.height - 2) / 2, -this.depth / 2 + 2],
          [-this.width / 2 + 2, (this.height - 2) / 2, this.depth / 2 - 2],
          [this.width / 2 - 2, (this.height - 2) / 2, this.depth / 2 - 2]
        ];
        positions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });

        // Footrest bar
        const footrestGeo = new THREE.BoxGeometry(this.width - 4, 1, 1);
        const footrest = new THREE.Mesh(footrestGeo, metalMat);
        footrest.position.set(0, this.height * 0.35, this.depth / 2 - 2);
        group.add(footrest);
      }

      createToilet3D(group, color) {
        // Bowl
        const bowlGeo = new THREE.CylinderGeometry(8, 6, 14, 16);
        const porcelainMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
        const bowl = new THREE.Mesh(bowlGeo, porcelainMat);
        bowl.position.set(0, 7, 4);
        group.add(bowl);

        // Tank
        const tankGeo = new THREE.BoxGeometry(16, 16, 8);
        const tank = new THREE.Mesh(tankGeo, porcelainMat);
        tank.position.set(0, 12, -this.depth / 2 + 4);
        group.add(tank);

        // Seat
        const seatGeo = new THREE.TorusGeometry(7, 2, 8, 16, Math.PI);
        const seatMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
        const seatMesh = new THREE.Mesh(seatGeo, seatMat);
        seatMesh.rotation.x = -Math.PI / 2;
        seatMesh.position.set(0, 15, 4);
        group.add(seatMesh);
      }

      createBathtub3D(group, color) {
        // Tub exterior
        const tubGeo = new THREE.BoxGeometry(this.width, 20, this.depth);
        const porcelainMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
        const tub = new THREE.Mesh(tubGeo, porcelainMat);
        tub.position.y = 10;
        group.add(tub);

        // Interior (darker)
        const interiorGeo = new THREE.BoxGeometry(this.width - 4, 16, this.depth - 4);
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0xe8e8e8, roughness: 0.2 });
        const interior = new THREE.Mesh(interiorGeo, interiorMat);
        interior.position.y = 12;
        group.add(interior);
      }

      createSink3D(group, color) {
        // Vanity/cabinet
        const cabinetGeo = new THREE.BoxGeometry(this.width, 30, this.depth);
        const cabinetMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
        const cabinet = new THREE.Mesh(cabinetGeo, cabinetMat);
        cabinet.position.y = 15;
        group.add(cabinet);

        // Countertop
        const counterGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const counterMat = new THREE.MeshStandardMaterial({ color: 0xd3d3d3, roughness: 0.4 });
        const counter = new THREE.Mesh(counterGeo, counterMat);
        counter.position.y = 31;
        group.add(counter);

        // Basin
        const basinGeo = new THREE.CylinderGeometry(8, 6, 4, 16);
        const basinMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3 });
        const basin = new THREE.Mesh(basinGeo, basinMat);
        basin.position.y = 30;
        group.add(basin);
      }

      createRefrigerator3D(group, color) {
        // Main body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Door line
        const lineGeo = new THREE.BoxGeometry(this.width + 0.5, 1, 0.5);
        const lineMat = new THREE.MeshStandardMaterial({ color: 0x333333 });
        const line = new THREE.Mesh(lineGeo, lineMat);
        line.position.set(0, this.height * 0.65, this.depth / 2);
        group.add(line);

        // Handle
        const handleGeo = new THREE.BoxGeometry(1, 8, 1);
        const handle = new THREE.Mesh(handleGeo, lineMat);
        handle.position.set(this.width / 2 - 3, this.height * 0.5, this.depth / 2 + 0.5);
        group.add(handle);
      }

      createStove3D(group, color) {
        // Body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Burners
        const burnerGeo = new THREE.CylinderGeometry(4, 4, 1, 16);
        const burnerMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        const burnerPositions = [[-8, this.height + 0.5, -6], [8, this.height + 0.5, -6], [-8, this.height + 0.5, 6], [8, this.height + 0.5, 6]];
        burnerPositions.forEach(pos => {
          const burner = new THREE.Mesh(burnerGeo, burnerMat);
          burner.position.set(...pos);
          group.add(burner);
        });
      }

      createNightstand3D(group, color) {
        // Body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const body = new THREE.Mesh(bodyGeo, woodMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Drawer
        const drawerGeo = new THREE.BoxGeometry(this.width - 4, this.height / 2 - 2, 1);
        const drawerMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 });
        const drawer = new THREE.Mesh(drawerGeo, drawerMat);
        drawer.position.set(0, this.height / 3, this.depth / 2 + 0.5);
        group.add(drawer);

        // Knob
        const knobGeo = new THREE.SphereGeometry(1, 8, 8);
        const knobMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8 });
        const knob = new THREE.Mesh(knobGeo, knobMat);
        knob.position.set(0, this.height / 3, this.depth / 2 + 2);
        group.add(knob);
      }

      createDresser3D(group, color) {
        // Body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });
        const body = new THREE.Mesh(bodyGeo, woodMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Drawers (3 rows)
        const drawerHeight = this.height / 3 - 2;
        const drawerMat = new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.6 });
        for (let i = 0; i < 3; i++) {
          const drawerGeo = new THREE.BoxGeometry(this.width - 4, drawerHeight, 1);
          const drawer = new THREE.Mesh(drawerGeo, drawerMat);
          drawer.position.set(0, drawerHeight / 2 + 2 + i * (drawerHeight + 2), this.depth / 2 + 0.5);
          group.add(drawer);

          // Knobs
          const knobGeo = new THREE.SphereGeometry(1, 8, 8);
          const knobMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8 });
          const knob1 = new THREE.Mesh(knobGeo, knobMat);
          knob1.position.set(-10, drawerHeight / 2 + 2 + i * (drawerHeight + 2), this.depth / 2 + 2);
          group.add(knob1);
          const knob2 = new THREE.Mesh(knobGeo, knobMat);
          knob2.position.set(10, drawerHeight / 2 + 2 + i * (drawerHeight + 2), this.depth / 2 + 2);
          group.add(knob2);
        }
      }

      createBookshelf3D(group, color) {
        const shelfThickness = 2;
        const numShelves = 4;
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.7 });

        // Sides
        const sideGeo = new THREE.BoxGeometry(2, this.height, this.depth);
        const leftSide = new THREE.Mesh(sideGeo, woodMat);
        leftSide.position.set(-this.width / 2 + 1, this.height / 2, 0);
        group.add(leftSide);
        const rightSide = new THREE.Mesh(sideGeo, woodMat);
        rightSide.position.set(this.width / 2 - 1, this.height / 2, 0);
        group.add(rightSide);

        // Back
        const backGeo = new THREE.BoxGeometry(this.width, this.height, 1);
        const backMat = new THREE.MeshStandardMaterial({ color: 0x5c4033, roughness: 0.8 });
        const back = new THREE.Mesh(backGeo, backMat);
        back.position.set(0, this.height / 2, -this.depth / 2 + 0.5);
        group.add(back);

        // Shelves
        const shelfGeo = new THREE.BoxGeometry(this.width - 4, shelfThickness, this.depth - 2);
        for (let i = 0; i <= numShelves; i++) {
          const shelf = new THREE.Mesh(shelfGeo, woodMat);
          shelf.position.y = i * (this.height / numShelves);
          group.add(shelf);
        }
      }

      createCoffeeTable3D(group, color) {
        // Top
        const topGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const woodMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const top = new THREE.Mesh(topGeo, woodMat);
        top.position.y = this.height;
        group.add(top);

        // Shelf
        const shelfGeo = new THREE.BoxGeometry(this.width - 6, 1, this.depth - 6);
        const shelf = new THREE.Mesh(shelfGeo, woodMat);
        shelf.position.y = this.height / 2;
        group.add(shelf);

        // Legs
        const legGeo = new THREE.BoxGeometry(2, this.height - 2, 2);
        const positions = [
          [-this.width / 2 + 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [this.width / 2 - 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [-this.width / 2 + 3, (this.height - 2) / 2, this.depth / 2 - 3],
          [this.width / 2 - 3, (this.height - 2) / 2, this.depth / 2 - 3]
        ];
        positions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, woodMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      // Workshop 3D Models
      createWorkbench3D(group, color) {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.4, metalness: 0.6 });

        // Top surface (thick butcher block style)
        const topGeo = new THREE.BoxGeometry(this.width, 3, this.depth);
        const top = new THREE.Mesh(topGeo, woodMat);
        top.position.y = this.height;
        group.add(top);

        // Frame legs (metal)
        const legGeo = new THREE.BoxGeometry(2, this.height - 3, 2);
        const legPositions = [
          [-this.width / 2 + 3, (this.height - 3) / 2, -this.depth / 2 + 3],
          [this.width / 2 - 3, (this.height - 3) / 2, -this.depth / 2 + 3],
          [-this.width / 2 + 3, (this.height - 3) / 2, this.depth / 2 - 3],
          [this.width / 2 - 3, (this.height - 3) / 2, this.depth / 2 - 3]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });

        // Lower shelf
        const shelfGeo = new THREE.BoxGeometry(this.width - 8, 1, this.depth - 8);
        const shelf = new THREE.Mesh(shelfGeo, woodMat);
        shelf.position.y = 8;
        group.add(shelf);

        // Optional vise (on workbench)
        if (this.type === 'workbench') {
          const viseGeo = new THREE.BoxGeometry(6, 5, 8);
          const vise = new THREE.Mesh(viseGeo, metalMat);
          vise.position.set(-this.width / 2 + 6, this.height + 2.5, 0);
          group.add(vise);
        }
      }

      createToolChest3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

        // Main body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Drawer faces (multiple drawers)
        const numDrawers = 6;
        const drawerHeight = (this.height - 4) / numDrawers;
        for (let i = 0; i < numDrawers; i++) {
          const drawerGeo = new THREE.BoxGeometry(this.width - 2, drawerHeight - 1, 0.5);
          const drawer = new THREE.Mesh(drawerGeo, darkMat);
          drawer.position.set(0, 2 + drawerHeight / 2 + i * drawerHeight, this.depth / 2);
          group.add(drawer);

          // Handle
          const handleGeo = new THREE.BoxGeometry(this.width * 0.4, 1, 1);
          const handle = new THREE.Mesh(handleGeo, new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.8 }));
          handle.position.set(0, 2 + drawerHeight / 2 + i * drawerHeight, this.depth / 2 + 1);
          group.add(handle);
        }

        // Casters/wheels
        const casterGeo = new THREE.CylinderGeometry(2, 2, 1, 12);
        const casterPositions = [
          [-this.width / 2 + 4, 0.5, -this.depth / 2 + 4],
          [this.width / 2 - 4, 0.5, -this.depth / 2 + 4],
          [-this.width / 2 + 4, 0.5, this.depth / 2 - 4],
          [this.width / 2 - 4, 0.5, this.depth / 2 - 4]
        ];
        casterPositions.forEach(pos => {
          const caster = new THREE.Mesh(casterGeo, darkMat);
          caster.rotation.z = Math.PI / 2;
          caster.position.set(...pos);
          group.add(caster);
        });
      }

      createLathe3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });
        const greenMat = new THREE.MeshStandardMaterial({ color: 0x276749, roughness: 0.5 });

        // Bed/base
        const bedGeo = new THREE.BoxGeometry(this.width, 8, this.depth);
        const bed = new THREE.Mesh(bedGeo, greenMat);
        bed.position.y = 4;
        group.add(bed);

        // Headstock (left side)
        const headstockGeo = new THREE.BoxGeometry(12, 16, this.depth);
        const headstock = new THREE.Mesh(headstockGeo, metalMat);
        headstock.position.set(-this.width / 2 + 6, 16, 0);
        group.add(headstock);

        // Chuck (spindle)
        const chuckGeo = new THREE.CylinderGeometry(6, 6, 4, 16);
        const chuck = new THREE.Mesh(chuckGeo, darkMat);
        chuck.rotation.z = Math.PI / 2;
        chuck.position.set(-this.width / 2 + 14, 16, 0);
        group.add(chuck);

        // Tailstock (right side)
        const tailstockGeo = new THREE.BoxGeometry(8, 12, this.depth * 0.6);
        const tailstock = new THREE.Mesh(tailstockGeo, metalMat);
        tailstock.position.set(this.width / 2 - 8, 14, 0);
        group.add(tailstock);

        // Carriage (tool holder)
        const carriageGeo = new THREE.BoxGeometry(10, 10, this.depth * 0.8);
        const carriage = new THREE.Mesh(carriageGeo, metalMat);
        carriage.position.set(0, 13, 0);
        group.add(carriage);

        // Legs
        const legGeo = new THREE.BoxGeometry(4, this.height - 24, 4);
        const legPositions = [
          [-this.width / 2 + 6, (this.height - 24) / 2 + 8, -this.depth / 2 + 4],
          [-this.width / 2 + 6, (this.height - 24) / 2 + 8, this.depth / 2 - 4],
          [this.width / 2 - 6, (this.height - 24) / 2 + 8, -this.depth / 2 + 4],
          [this.width / 2 - 6, (this.height - 24) / 2 + 8, this.depth / 2 - 4]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createMill3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Base/pedestal
        const baseGeo = new THREE.BoxGeometry(this.width * 0.8, 12, this.depth);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = 6;
        group.add(base);

        // Column (vertical support)
        const columnGeo = new THREE.BoxGeometry(12, this.height - 12, 12);
        const column = new THREE.Mesh(columnGeo, metalMat);
        column.position.set(-this.width / 2 + 12, 12 + (this.height - 12) / 2, -this.depth / 2 + 8);
        group.add(column);

        // Head (top motor housing)
        const headGeo = new THREE.BoxGeometry(16, 14, 14);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.set(-this.width / 2 + 16, this.height - 7, -this.depth / 2 + 8);
        group.add(head);

        // Spindle
        const spindleGeo = new THREE.CylinderGeometry(2, 2, 12, 12);
        const spindle = new THREE.Mesh(spindleGeo, metalMat);
        spindle.position.set(-this.width / 2 + 16, this.height - 20, -this.depth / 2 + 8);
        group.add(spindle);

        // Table (work surface)
        const tableGeo = new THREE.BoxGeometry(this.width * 0.7, 3, this.depth * 0.6);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.set(0, 24, 0);
        group.add(tableMesh);

        // Table T-slots
        for (let i = -2; i <= 2; i++) {
          const slotGeo = new THREE.BoxGeometry(this.width * 0.65, 0.5, 1);
          const slot = new THREE.Mesh(slotGeo, darkMat);
          slot.position.set(0, 25.5, i * 4);
          group.add(slot);
        }
      }

      createDrillPress3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Base plate
        const baseGeo = new THREE.BoxGeometry(this.width, 4, this.depth);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = 2;
        group.add(base);

        // Column
        const columnGeo = new THREE.CylinderGeometry(2, 2, this.height - 14, 16);
        const column = new THREE.Mesh(columnGeo, metalMat);
        column.position.set(0, 4 + (this.height - 14) / 2, -this.depth / 2 + 4);
        group.add(column);

        // Head (motor housing)
        const headGeo = new THREE.BoxGeometry(10, 14, 10);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.set(0, this.height - 7, 0);
        group.add(head);

        // Chuck
        const chuckGeo = new THREE.CylinderGeometry(2.5, 1.5, 4, 16);
        const chuck = new THREE.Mesh(chuckGeo, metalMat);
        chuck.position.set(0, this.height - 16, 0);
        group.add(chuck);

        // Work table (round)
        const tableGeo = new THREE.CylinderGeometry(this.width / 2 - 2, this.width / 2 - 2, 2, 16);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.y = this.height / 2;
        group.add(tableMesh);

        // Depth handle (wheel)
        const wheelGeo = new THREE.TorusGeometry(3, 0.5, 8, 16);
        const wheel = new THREE.Mesh(wheelGeo, metalMat);
        wheel.position.set(6, this.height - 10, 4);
        group.add(wheel);
      }

      createBandsaw3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Base/cabinet
        const baseGeo = new THREE.BoxGeometry(this.width, 30, this.depth);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = 15;
        group.add(base);

        // Table
        const tableGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.y = 32;
        group.add(tableMesh);

        // Upper wheel housing
        const upperGeo = new THREE.BoxGeometry(8, this.height - 32, this.depth * 0.8);
        const upper = new THREE.Mesh(upperGeo, metalMat);
        upper.position.set(-this.width / 2 + 8, 32 + (this.height - 32) / 2, 0);
        group.add(upper);

        // Blade guides
        const guideGeo = new THREE.BoxGeometry(4, 8, 4);
        const guide = new THREE.Mesh(guideGeo, darkMat);
        guide.position.set(-this.width / 2 + 12, 40, 0);
        group.add(guide);

        // Blade (thin vertical line)
        const bladeGeo = new THREE.BoxGeometry(0.2, this.height - 32, 0.5);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.position.set(-this.width / 2 + 12, 32 + (this.height - 32) / 2, 0);
        group.add(blade);
      }

      createTableSaw3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Cabinet base
        const baseGeo = new THREE.BoxGeometry(this.width * 0.6, this.height - 2, this.depth * 0.6);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = (this.height - 2) / 2;
        group.add(base);

        // Table surface
        const tableGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.y = this.height;
        group.add(tableMesh);

        // Blade slot
        const slotGeo = new THREE.BoxGeometry(0.3, 1, this.depth * 0.8);
        const slot = new THREE.Mesh(slotGeo, darkMat);
        slot.position.set(0, this.height + 0.5, 0);
        group.add(slot);

        // Blade (exposed portion)
        const bladeGeo = new THREE.CylinderGeometry(5, 5, 0.2, 32);
        const bladeMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.9 });
        const blade = new THREE.Mesh(bladeGeo, bladeMat);
        blade.rotation.x = Math.PI / 2;
        blade.position.set(0, this.height + 3, 0);
        group.add(blade);

        // Fence
        const fenceGeo = new THREE.BoxGeometry(2, 4, this.depth);
        const fence = new THREE.Mesh(fenceGeo, metalMat);
        fence.position.set(this.width / 4, this.height + 3, 0);
        group.add(fence);

        // Miter gauge slot
        const miterGeo = new THREE.BoxGeometry(this.width, 0.5, 1);
        const miter = new THREE.Mesh(miterGeo, darkMat);
        miter.position.set(0, this.height + 0.2, -this.depth / 4);
        group.add(miter);
      }

      createGrinder3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Motor housing (center)
        const motorGeo = new THREE.BoxGeometry(this.width * 0.4, this.height * 0.6, this.depth);
        const motor = new THREE.Mesh(motorGeo, metalMat);
        motor.position.y = this.height * 0.3;
        group.add(motor);

        // Left grinding wheel
        const wheelGeo = new THREE.CylinderGeometry(this.height * 0.4, this.height * 0.4, 2, 24);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.8 });
        const leftWheel = new THREE.Mesh(wheelGeo, wheelMat);
        leftWheel.rotation.z = Math.PI / 2;
        leftWheel.position.set(-this.width / 2 + 3, this.height * 0.5, 0);
        group.add(leftWheel);

        // Right grinding wheel
        const rightWheel = new THREE.Mesh(wheelGeo, wheelMat);
        rightWheel.rotation.z = Math.PI / 2;
        rightWheel.position.set(this.width / 2 - 3, this.height * 0.5, 0);
        group.add(rightWheel);

        // Wheel guards
        const guardGeo = new THREE.BoxGeometry(4, this.height * 0.5, this.depth * 0.8);
        const leftGuard = new THREE.Mesh(guardGeo, darkMat);
        leftGuard.position.set(-this.width / 2 + 3, this.height * 0.6, 0);
        group.add(leftGuard);

        const rightGuard = new THREE.Mesh(guardGeo, darkMat);
        rightGuard.position.set(this.width / 2 - 3, this.height * 0.6, 0);
        group.add(rightGuard);

        // Eye shields
        const shieldGeo = new THREE.BoxGeometry(0.2, 4, 4);
        const shieldMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.6 });
        const leftShield = new THREE.Mesh(shieldGeo, shieldMat);
        leftShield.position.set(-this.width / 2 + 6, this.height * 0.8, this.depth / 2);
        group.add(leftShield);

        const rightShield = new THREE.Mesh(shieldGeo, shieldMat);
        rightShield.position.set(this.width / 2 - 6, this.height * 0.8, this.depth / 2);
        group.add(rightShield);
      }

      createCNCRouter3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });
        const aluminumMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.3, metalness: 0.7 });

        // Table/bed
        const tableGeo = new THREE.BoxGeometry(this.width, 4, this.depth);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.y = 2;
        group.add(tableMesh);

        // Spoilboard (MDF surface)
        const spoilGeo = new THREE.BoxGeometry(this.width - 4, 2, this.depth - 4);
        const spoilMat = new THREE.MeshStandardMaterial({ color: 0xb5651d, roughness: 0.9 });
        const spoil = new THREE.Mesh(spoilGeo, spoilMat);
        spoil.position.y = 5;
        group.add(spoil);

        // Gantry uprights
        const uprightGeo = new THREE.BoxGeometry(4, this.height - 6, 4);
        const leftUpright = new THREE.Mesh(uprightGeo, aluminumMat);
        leftUpright.position.set(-this.width / 2 + 2, 6 + (this.height - 6) / 2, 0);
        group.add(leftUpright);

        const rightUpright = new THREE.Mesh(uprightGeo, aluminumMat);
        rightUpright.position.set(this.width / 2 - 2, 6 + (this.height - 6) / 2, 0);
        group.add(rightUpright);

        // Gantry beam
        const beamGeo = new THREE.BoxGeometry(this.width - 8, 6, 6);
        const beam = new THREE.Mesh(beamGeo, aluminumMat);
        beam.position.set(0, this.height - 3, 0);
        group.add(beam);

        // Spindle carriage
        const carriageGeo = new THREE.BoxGeometry(8, 10, 8);
        const carriage = new THREE.Mesh(carriageGeo, darkMat);
        carriage.position.set(0, this.height - 8, 0);
        group.add(carriage);

        // Spindle
        const spindleGeo = new THREE.CylinderGeometry(2, 2, 12, 12);
        const spindle = new THREE.Mesh(spindleGeo, metalMat);
        spindle.position.set(0, this.height - 19, 0);
        group.add(spindle);

        // Legs
        const legGeo = new THREE.BoxGeometry(3, this.height - 6, 3);
        const legPositions = [
          [-this.width / 2 + 4, (this.height - 6) / 2 + 6, -this.depth / 2 + 4],
          [this.width / 2 - 4, (this.height - 6) / 2 + 6, -this.depth / 2 + 4],
          [-this.width / 2 + 4, (this.height - 6) / 2 + 6, this.depth / 2 - 4],
          [this.width / 2 - 4, (this.height - 6) / 2 + 6, this.depth / 2 - 4]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createWeldingStation3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5, metalness: 0.6 });
        const blueMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });

        // Steel welding table
        const tableGeo = new THREE.BoxGeometry(this.width, 3, this.depth);
        const tableMesh = new THREE.Mesh(tableGeo, metalMat);
        tableMesh.position.y = this.height;
        group.add(tableMesh);

        // Table holes pattern (simplified)
        const holeSpacing = 6;
        const holeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
        for (let x = -this.width / 2 + holeSpacing; x < this.width / 2; x += holeSpacing) {
          for (let z = -this.depth / 2 + holeSpacing; z < this.depth / 2; z += holeSpacing) {
            const holeGeo = new THREE.CylinderGeometry(0.8, 0.8, 1, 8);
            const hole = new THREE.Mesh(holeGeo, holeMat);
            hole.position.set(x, this.height + 1.5, z);
            group.add(hole);
          }
        }

        // Legs (heavy duty)
        const legGeo = new THREE.BoxGeometry(3, this.height - 3, 3);
        const legPositions = [
          [-this.width / 2 + 3, (this.height - 3) / 2, -this.depth / 2 + 3],
          [this.width / 2 - 3, (this.height - 3) / 2, -this.depth / 2 + 3],
          [-this.width / 2 + 3, (this.height - 3) / 2, this.depth / 2 - 3],
          [this.width / 2 - 3, (this.height - 3) / 2, this.depth / 2 - 3]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });

        // Welder machine (if welding station, not just table)
        if (this.type === 'welder') {
          const welderGeo = new THREE.BoxGeometry(14, 16, 10);
          const welder = new THREE.Mesh(welderGeo, blueMat);
          welder.position.set(this.width / 2 - 10, this.height + 11, -this.depth / 2 + 8);
          group.add(welder);

          // Control panel
          const panelGeo = new THREE.BoxGeometry(8, 6, 0.5);
          const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a });
          const panel = new THREE.Mesh(panelGeo, panelMat);
          panel.position.set(this.width / 2 - 10, this.height + 16, -this.depth / 2 + 13.5);
          group.add(panel);

          // Wire spool
          const spoolGeo = new THREE.CylinderGeometry(4, 4, 3, 16);
          const spoolMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, metalness: 0.7 });
          const spool = new THREE.Mesh(spoolGeo, spoolMat);
          spool.rotation.z = Math.PI / 2;
          spool.position.set(this.width / 2 - 10, this.height + 22, -this.depth / 2 + 8);
          group.add(spool);
        }
      }

      createOutfeedTable3D(group, color) {
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x8B4513, roughness: 0.7 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.4, metalness: 0.6 });

        // Smooth top surface
        const topGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const top = new THREE.Mesh(topGeo, woodMat);
        top.position.y = this.height;
        group.add(top);

        // Folding legs (shown in up position)
        const legGeo = new THREE.BoxGeometry(2, this.height - 2, 2);
        const legPositions = [
          [-this.width / 2 + 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [this.width / 2 - 3, (this.height - 2) / 2, -this.depth / 2 + 3],
          [-this.width / 2 + 3, (this.height - 2) / 2, this.depth / 2 - 3],
          [this.width / 2 - 3, (this.height - 2) / 2, this.depth / 2 - 3]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });

        // Cross braces
        const braceGeo = new THREE.BoxGeometry(this.width - 8, 1, 1);
        const brace = new THREE.Mesh(braceGeo, metalMat);
        brace.position.y = 10;
        group.add(brace);
      }

      // Storage 3D Models
      createShelving3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.6 });
        const shelfMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.5 });

        // Uprights (4 corner posts)
        const postGeo = new THREE.BoxGeometry(2, this.height, 2);
        const postPositions = [
          [-this.width / 2 + 1, this.height / 2, -this.depth / 2 + 1],
          [this.width / 2 - 1, this.height / 2, -this.depth / 2 + 1],
          [-this.width / 2 + 1, this.height / 2, this.depth / 2 - 1],
          [this.width / 2 - 1, this.height / 2, this.depth / 2 - 1]
        ];
        postPositions.forEach(pos => {
          const post = new THREE.Mesh(postGeo, metalMat);
          post.position.set(...pos);
          group.add(post);
        });

        // Shelves (4 levels)
        const numShelves = 4;
        const shelfGeo = new THREE.BoxGeometry(this.width - 4, 1.5, this.depth - 4);
        for (let i = 0; i <= numShelves; i++) {
          const shelf = new THREE.Mesh(shelfGeo, shelfMat);
          shelf.position.y = (i * this.height) / numShelves + 1;
          group.add(shelf);
        }
      }

      createCabinet3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5 });

        // Main body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = this.height / 2;
        group.add(body);

        // Door line (vertical center)
        const doorLineGeo = new THREE.BoxGeometry(0.5, this.height - 4, 0.5);
        const doorLine = new THREE.Mesh(doorLineGeo, darkMat);
        doorLine.position.set(0, this.height / 2, this.depth / 2);
        group.add(doorLine);

        // Handles
        const handleGeo = new THREE.BoxGeometry(1, 6, 1);
        const handle1 = new THREE.Mesh(handleGeo, darkMat);
        handle1.position.set(-4, this.height / 2, this.depth / 2 + 0.5);
        group.add(handle1);
        const handle2 = new THREE.Mesh(handleGeo, darkMat);
        handle2.position.set(4, this.height / 2, this.depth / 2 + 0.5);
        group.add(handle2);
      }

      createPalletRack3D(group, color) {
        const orangeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const beamMat = new THREE.MeshStandardMaterial({ color: 0xfbbf24, roughness: 0.5 });

        // Uprights (vertical posts)
        const postGeo = new THREE.BoxGeometry(4, this.height, 4);
        const postPositions = [
          [-this.width / 2 + 2, this.height / 2, -this.depth / 2 + 2],
          [this.width / 2 - 2, this.height / 2, -this.depth / 2 + 2],
          [-this.width / 2 + 2, this.height / 2, this.depth / 2 - 2],
          [this.width / 2 - 2, this.height / 2, this.depth / 2 - 2]
        ];
        postPositions.forEach(pos => {
          const post = new THREE.Mesh(postGeo, orangeMat);
          post.position.set(...pos);
          group.add(post);
        });

        // Beams (3 levels)
        const numLevels = 3;
        const beamGeo = new THREE.BoxGeometry(this.width - 8, 4, 3);
        for (let i = 1; i <= numLevels; i++) {
          const frontBeam = new THREE.Mesh(beamGeo, beamMat);
          frontBeam.position.set(0, (i * this.height) / (numLevels + 1), -this.depth / 2 + 4);
          group.add(frontBeam);
          const backBeam = new THREE.Mesh(beamGeo, beamMat);
          backBeam.position.set(0, (i * this.height) / (numLevels + 1), this.depth / 2 - 4);
          group.add(backBeam);
        }
      }

      createBinRack3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
        const binColors = [0x3b82f6, 0xef4444, 0x22c55e, 0xfbbf24, 0x8b5cf6, 0xec4899];

        // Frame
        const frameGeo = new THREE.BoxGeometry(this.width, this.height, 2);
        const frame = new THREE.Mesh(frameGeo, metalMat);
        frame.position.set(0, this.height / 2, -this.depth / 2 + 1);
        group.add(frame);

        // Bins (grid of small boxes)
        const cols = 4;
        const rows = 5;
        const binWidth = (this.width - 4) / cols;
        const binHeight = (this.height - 4) / rows;
        const binDepth = this.depth - 4;

        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            const binMat = new THREE.MeshStandardMaterial({
              color: binColors[(r * cols + c) % binColors.length],
              roughness: 0.6
            });
            const binGeo = new THREE.BoxGeometry(binWidth - 1, binHeight - 1, binDepth);
            const bin = new THREE.Mesh(binGeo, binMat);
            bin.position.set(
              -this.width / 2 + 2 + binWidth / 2 + c * binWidth,
              2 + binHeight / 2 + r * binHeight,
              binDepth / 2 - this.depth / 2 + 2
            );
            group.add(bin);
          }
        }
      }

      createLumberRack3D(group, color) {
        const orangeMat = new THREE.MeshStandardMaterial({ color, roughness: 0.5 });
        const woodMat = new THREE.MeshStandardMaterial({ color: 0x92400e, roughness: 0.8 });

        // Uprights
        const postGeo = new THREE.BoxGeometry(4, this.height, 4);
        const postPositions = [
          [-this.width / 2 + 2, this.height / 2, 0],
          [this.width / 2 - 2, this.height / 2, 0]
        ];
        postPositions.forEach(pos => {
          const post = new THREE.Mesh(postGeo, orangeMat);
          post.position.set(...pos);
          group.add(post);
        });

        // Arms (horizontal supports for lumber)
        const numArms = 4;
        const armGeo = new THREE.BoxGeometry(4, 2, this.depth - 4);
        for (let i = 1; i <= numArms; i++) {
          const leftArm = new THREE.Mesh(armGeo, orangeMat);
          leftArm.position.set(-this.width / 2 + 4, (i * this.height) / (numArms + 1), 0);
          group.add(leftArm);
          const rightArm = new THREE.Mesh(armGeo, orangeMat);
          rightArm.position.set(this.width / 2 - 4, (i * this.height) / (numArms + 1), 0);
          group.add(rightArm);

          // Lumber on arms
          const lumberGeo = new THREE.BoxGeometry(this.width - 16, 3, this.depth - 8);
          const lumber = new THREE.Mesh(lumberGeo, woodMat);
          lumber.position.set(0, (i * this.height) / (numArms + 1) + 2.5, 0);
          group.add(lumber);
        }
      }

      // Equipment 3D Models
      createAirCompressor3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Tank (horizontal cylinder)
        const tankGeo = new THREE.CylinderGeometry(this.width / 3, this.width / 3, this.depth - 8, 24);
        const tank = new THREE.Mesh(tankGeo, metalMat);
        tank.rotation.x = Math.PI / 2;
        tank.position.set(0, this.width / 3 + 4, 0);
        group.add(tank);

        // Motor housing
        const motorGeo = new THREE.BoxGeometry(this.width / 2, this.height - this.width / 3 - 4, this.depth / 3);
        const motor = new THREE.Mesh(motorGeo, darkMat);
        motor.position.set(0, this.width / 3 + 4 + (this.height - this.width / 3 - 4) / 2, -this.depth / 4);
        group.add(motor);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(3, 3, 2, 16);
        const wheel1 = new THREE.Mesh(wheelGeo, darkMat);
        wheel1.rotation.z = Math.PI / 2;
        wheel1.position.set(-this.width / 2 + 4, 3, this.depth / 2 - 6);
        group.add(wheel1);
        const wheel2 = new THREE.Mesh(wheelGeo, darkMat);
        wheel2.rotation.z = Math.PI / 2;
        wheel2.position.set(this.width / 2 - 4, 3, this.depth / 2 - 6);
        group.add(wheel2);
      }

      createDustCollector3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
        const bagMat = new THREE.MeshStandardMaterial({ color: 0xf5f5dc, roughness: 0.9 });

        // Collection drum (bottom)
        const drumGeo = new THREE.CylinderGeometry(this.width / 2 - 2, this.width / 2 - 2, this.height / 2, 24);
        const drum = new THREE.Mesh(drumGeo, metalMat);
        drum.position.y = this.height / 4;
        group.add(drum);

        // Filter bag (top)
        const bagGeo = new THREE.CylinderGeometry(this.width / 2 - 4, this.width / 2 - 2, this.height / 2 - 4, 24);
        const bag = new THREE.Mesh(bagGeo, bagMat);
        bag.position.y = this.height * 0.7;
        group.add(bag);

        // Inlet pipe
        const pipeGeo = new THREE.CylinderGeometry(3, 3, 10, 12);
        const pipe = new THREE.Mesh(pipeGeo, metalMat);
        pipe.rotation.z = Math.PI / 2;
        pipe.position.set(-this.width / 2 + 2, this.height / 3, 0);
        group.add(pipe);
      }

      createVise3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });

        // Base
        const baseGeo = new THREE.BoxGeometry(this.width, this.height / 3, this.depth);
        const base = new THREE.Mesh(baseGeo, metalMat);
        base.position.y = this.height / 6;
        group.add(base);

        // Fixed jaw
        const fixedJawGeo = new THREE.BoxGeometry(this.width * 0.8, this.height * 0.5, 2);
        const fixedJaw = new THREE.Mesh(fixedJawGeo, metalMat);
        fixedJaw.position.set(0, this.height / 3 + this.height * 0.25, -this.depth / 2 + 2);
        group.add(fixedJaw);

        // Moving jaw
        const movingJawGeo = new THREE.BoxGeometry(this.width * 0.8, this.height * 0.5, 2);
        const movingJaw = new THREE.Mesh(movingJawGeo, metalMat);
        movingJaw.position.set(0, this.height / 3 + this.height * 0.25, this.depth / 4);
        group.add(movingJaw);

        // Handle
        const handleGeo = new THREE.CylinderGeometry(0.5, 0.5, this.width, 8);
        const handle = new THREE.Mesh(handleGeo, metalMat);
        handle.rotation.z = Math.PI / 2;
        handle.position.set(0, this.height * 0.6, this.depth / 2);
        group.add(handle);
      }

      createHydraulicPress3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Frame uprights
        const uprightGeo = new THREE.BoxGeometry(4, this.height, 4);
        const leftUpright = new THREE.Mesh(uprightGeo, metalMat);
        leftUpright.position.set(-this.width / 2 + 2, this.height / 2, 0);
        group.add(leftUpright);
        const rightUpright = new THREE.Mesh(uprightGeo, metalMat);
        rightUpright.position.set(this.width / 2 - 2, this.height / 2, 0);
        group.add(rightUpright);

        // Top beam
        const topBeamGeo = new THREE.BoxGeometry(this.width, 6, this.depth);
        const topBeam = new THREE.Mesh(topBeamGeo, metalMat);
        topBeam.position.set(0, this.height - 3, 0);
        group.add(topBeam);

        // Bottom beam
        const bottomBeamGeo = new THREE.BoxGeometry(this.width, 4, this.depth);
        const bottomBeam = new THREE.Mesh(bottomBeamGeo, metalMat);
        bottomBeam.position.set(0, 2, 0);
        group.add(bottomBeam);

        // Ram/cylinder
        const ramGeo = new THREE.CylinderGeometry(4, 4, 20, 16);
        const ram = new THREE.Mesh(ramGeo, darkMat);
        ram.position.set(0, this.height - 16, 0);
        group.add(ram);

        // Press plate
        const plateGeo = new THREE.BoxGeometry(this.width - 16, 4, this.depth - 8);
        const plate = new THREE.Mesh(plateGeo, metalMat);
        plate.position.set(0, this.height - 28, 0);
        group.add(plate);
      }

      createForklift3D(group, color) {
        const yellowMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Body/cab
        const bodyGeo = new THREE.BoxGeometry(this.width * 0.6, this.height * 0.4, this.depth * 0.4);
        const body = new THREE.Mesh(bodyGeo, yellowMat);
        body.position.set(0, this.height * 0.25, -this.depth * 0.2);
        group.add(body);

        // Roof/cage
        const roofGeo = new THREE.BoxGeometry(this.width * 0.55, 2, this.depth * 0.35);
        const roof = new THREE.Mesh(roofGeo, yellowMat);
        roof.position.set(0, this.height * 0.5, -this.depth * 0.2);
        group.add(roof);

        // Mast (front vertical)
        const mastGeo = new THREE.BoxGeometry(4, this.height * 0.8, 4);
        const mastL = new THREE.Mesh(mastGeo, darkMat);
        mastL.position.set(-this.width * 0.2, this.height * 0.4, this.depth * 0.3);
        group.add(mastL);
        const mastR = new THREE.Mesh(mastGeo, darkMat);
        mastR.position.set(this.width * 0.2, this.height * 0.4, this.depth * 0.3);
        group.add(mastR);

        // Forks
        const forkGeo = new THREE.BoxGeometry(4, 2, this.depth * 0.4);
        const fork1 = new THREE.Mesh(forkGeo, darkMat);
        fork1.position.set(-this.width * 0.15, 2, this.depth * 0.4);
        group.add(fork1);
        const fork2 = new THREE.Mesh(forkGeo, darkMat);
        fork2.position.set(this.width * 0.15, 2, this.depth * 0.4);
        group.add(fork2);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(6, 6, 4, 16);
        const wheelPositions = [
          [-this.width * 0.25, 6, -this.depth * 0.35],
          [this.width * 0.25, 6, -this.depth * 0.35],
          [-this.width * 0.2, 4, this.depth * 0.2],
          [this.width * 0.2, 4, this.depth * 0.2]
        ];
        wheelPositions.forEach(pos => {
          const wheel = new THREE.Mesh(wheelGeo, darkMat);
          wheel.rotation.z = Math.PI / 2;
          wheel.position.set(...pos);
          group.add(wheel);
        });
      }

      createHandTruck3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });

        // Back plate
        const plateGeo = new THREE.BoxGeometry(this.width, this.height * 0.7, 1);
        const plate = new THREE.Mesh(plateGeo, metalMat);
        plate.position.set(0, this.height * 0.4, -this.depth / 2 + 0.5);
        group.add(plate);

        // Toe plate (bottom)
        const toeGeo = new THREE.BoxGeometry(this.width, 2, this.depth);
        const toe = new THREE.Mesh(toeGeo, metalMat);
        toe.position.set(0, 1, 0);
        group.add(toe);

        // Handles
        const handleGeo = new THREE.BoxGeometry(2, this.height * 0.3, 2);
        const handleL = new THREE.Mesh(handleGeo, metalMat);
        handleL.position.set(-this.width / 2 + 2, this.height * 0.85, -this.depth / 2);
        group.add(handleL);
        const handleR = new THREE.Mesh(handleGeo, metalMat);
        handleR.position.set(this.width / 2 - 2, this.height * 0.85, -this.depth / 2);
        group.add(handleR);

        // Wheels
        const wheelGeo = new THREE.CylinderGeometry(4, 4, 2, 16);
        const wheel1 = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        wheel1.rotation.z = Math.PI / 2;
        wheel1.position.set(-this.width / 2 + 5, 4, this.depth / 2 - 4);
        group.add(wheel1);
        const wheel2 = new THREE.Mesh(wheelGeo, new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
        wheel2.rotation.z = Math.PI / 2;
        wheel2.position.set(this.width / 2 - 5, 4, this.depth / 2 - 4);
        group.add(wheel2);
      }

      createWaterjet3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.6 });
        const waterMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, roughness: 0.2 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Table/tank
        const tankGeo = new THREE.BoxGeometry(this.width, 8, this.depth);
        const tank = new THREE.Mesh(tankGeo, metalMat);
        tank.position.y = 4;
        group.add(tank);

        // Water surface
        const waterGeo = new THREE.BoxGeometry(this.width - 4, 1, this.depth - 4);
        const water = new THREE.Mesh(waterGeo, waterMat);
        water.position.y = 7;
        group.add(water);

        // Gantry uprights
        const uprightGeo = new THREE.BoxGeometry(4, this.height - 8, 4);
        const uprightL = new THREE.Mesh(uprightGeo, metalMat);
        uprightL.position.set(-this.width / 2 + 4, 8 + (this.height - 8) / 2, 0);
        group.add(uprightL);
        const uprightR = new THREE.Mesh(uprightGeo, metalMat);
        uprightR.position.set(this.width / 2 - 4, 8 + (this.height - 8) / 2, 0);
        group.add(uprightR);

        // Gantry beam
        const beamGeo = new THREE.BoxGeometry(this.width - 8, 4, 4);
        const beam = new THREE.Mesh(beamGeo, metalMat);
        beam.position.set(0, this.height - 2, 0);
        group.add(beam);

        // Cutting head
        const headGeo = new THREE.CylinderGeometry(3, 2, 10, 12);
        const head = new THREE.Mesh(headGeo, darkMat);
        head.position.set(0, this.height - 12, 0);
        group.add(head);

        // Legs
        const legGeo = new THREE.BoxGeometry(3, 8, 3);
        const legPositions = [
          [-this.width / 2 + 4, 4, -this.depth / 2 + 4],
          [this.width / 2 - 4, 4, -this.depth / 2 + 4],
          [-this.width / 2 + 4, 4, this.depth / 2 - 4],
          [this.width / 2 - 4, 4, this.depth / 2 - 4]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createSandblaster3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.5 });
        const glassMat = new THREE.MeshStandardMaterial({ color: 0x87ceeb, transparent: true, opacity: 0.4 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x2d3748, roughness: 0.5 });

        // Cabinet body
        const bodyGeo = new THREE.BoxGeometry(this.width, this.height * 0.6, this.depth);
        const body = new THREE.Mesh(bodyGeo, metalMat);
        body.position.y = this.height * 0.5;
        group.add(body);

        // Viewing window
        const windowGeo = new THREE.BoxGeometry(this.width - 8, this.height * 0.3, 1);
        const window = new THREE.Mesh(windowGeo, glassMat);
        window.position.set(0, this.height * 0.55, this.depth / 2);
        group.add(window);

        // Arm holes
        const holeGeo = new THREE.CylinderGeometry(4, 4, 2, 16);
        const hole1 = new THREE.Mesh(holeGeo, darkMat);
        hole1.rotation.x = Math.PI / 2;
        hole1.position.set(-this.width / 4, this.height * 0.35, this.depth / 2);
        group.add(hole1);
        const hole2 = new THREE.Mesh(holeGeo, darkMat);
        hole2.rotation.x = Math.PI / 2;
        hole2.position.set(this.width / 4, this.height * 0.35, this.depth / 2);
        group.add(hole2);

        // Legs/stand
        const legGeo = new THREE.BoxGeometry(3, this.height * 0.2, 3);
        const legPositions = [
          [-this.width / 2 + 4, this.height * 0.1, -this.depth / 2 + 4],
          [this.width / 2 - 4, this.height * 0.1, -this.depth / 2 + 4],
          [-this.width / 2 + 4, this.height * 0.1, this.depth / 2 - 4],
          [this.width / 2 - 4, this.height * 0.1, this.depth / 2 - 4]
        ];
        legPositions.forEach(pos => {
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(...pos);
          group.add(leg);
        });
      }

      createAirManifold3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.7 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1e40af, roughness: 0.4, metalness: 0.6 });

        // Main vertical pipe
        const mainGeo = new THREE.CylinderGeometry(this.width / 3, this.width / 3, this.height, 16);
        const main = new THREE.Mesh(mainGeo, metalMat);
        main.position.y = this.height / 2;
        group.add(main);

        // Outlet ports (horizontal)
        const portGeo = new THREE.CylinderGeometry(1.5, 1.5, 6, 12);
        const numPorts = 4;
        for (let i = 0; i < numPorts; i++) {
          const port = new THREE.Mesh(portGeo, darkMat);
          port.rotation.z = Math.PI / 2;
          port.position.set(this.width / 3 + 3, 4 + (i * (this.height - 8)) / (numPorts - 1), 0);
          group.add(port);
        }

        // Mounting bracket
        const bracketGeo = new THREE.BoxGeometry(this.width / 2, 2, this.depth);
        const bracket = new THREE.Mesh(bracketGeo, metalMat);
        bracket.position.set(-this.width / 4, this.height / 2, 0);
        group.add(bracket);
      }

      createOfficeChair3D(group, color) {
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x2f2f2f, roughness: 0.3, metalness: 0.8 });
        const seatMat = new THREE.MeshStandardMaterial({ color, roughness: 0.8 });
        const meshMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });

        // 5-star base
        for (let i = 0; i < 5; i++) {
          const angle = (i * Math.PI * 2) / 5;
          const legGeo = new THREE.BoxGeometry(2, 1.5, 10);
          const leg = new THREE.Mesh(legGeo, metalMat);
          leg.position.set(Math.sin(angle) * 8, 1, Math.cos(angle) * 8);
          leg.rotation.y = angle;
          group.add(leg);

          // Casters
          const casterGeo = new THREE.SphereGeometry(1.5, 8, 8);
          const caster = new THREE.Mesh(casterGeo, metalMat);
          caster.position.set(Math.sin(angle) * 10, 1.5, Math.cos(angle) * 10);
          group.add(caster);
        }

        // Central post
        const postGeo = new THREE.CylinderGeometry(1.5, 2, 16, 16);
        const post = new THREE.Mesh(postGeo, metalMat);
        post.position.y = 10;
        group.add(post);

        // Seat
        const seatGeo = new THREE.BoxGeometry(this.width - 4, 4, this.depth - 6);
        const seat = new THREE.Mesh(seatGeo, seatMat);
        seat.position.y = 20;
        group.add(seat);

        // Backrest
        const backGeo = new THREE.BoxGeometry(this.width - 6, 16, 2);
        const back = new THREE.Mesh(backGeo, meshMat);
        back.position.set(0, 30, -this.depth / 2 + 2);
        back.rotation.x = 0.1;
        group.add(back);

        // Armrests
        for (let side of [-1, 1]) {
          const armGeo = new THREE.BoxGeometry(3, 2, 10);
          const arm = new THREE.Mesh(armGeo, metalMat);
          arm.position.set(side * (this.width / 2 - 3), 26, -2);
          group.add(arm);

          const armSupportGeo = new THREE.BoxGeometry(2, 6, 2);
          const armSupport = new THREE.Mesh(armSupportGeo, metalMat);
          armSupport.position.set(side * (this.width / 2 - 3), 23, -2);
          group.add(armSupport);
        }
      }

      createShopSink3D(group, color) {
        const steelMat = new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.8 });
        const darkMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });

        // Cabinet base
        const cabinetGeo = new THREE.BoxGeometry(this.width, this.height - 8, this.depth);
        const cabinet = new THREE.Mesh(cabinetGeo, darkMat);
        cabinet.position.y = (this.height - 8) / 2;
        group.add(cabinet);

        // Sink basin (recessed)
        const basinGeo = new THREE.BoxGeometry(this.width - 4, 8, this.depth - 4);
        const basin = new THREE.Mesh(basinGeo, steelMat);
        basin.position.y = this.height - 4;
        group.add(basin);

        // Basin interior (darker)
        const interiorGeo = new THREE.BoxGeometry(this.width - 6, 6, this.depth - 6);
        const interiorMat = new THREE.MeshStandardMaterial({ color: 0x4a5568, roughness: 0.4, metalness: 0.6 });
        const interior = new THREE.Mesh(interiorGeo, interiorMat);
        interior.position.y = this.height - 5;
        group.add(interior);

        // Faucet
        const faucetBaseMat = new THREE.MeshStandardMaterial({ color: 0xc0c0c0, roughness: 0.2, metalness: 0.9 });
        const baseGeo = new THREE.CylinderGeometry(1.5, 1.5, 3, 12);
        const base = new THREE.Mesh(baseGeo, faucetBaseMat);
        base.position.set(0, this.height + 1.5, -this.depth / 2 + 4);
        group.add(base);

        // Faucet neck
        const neckGeo = new THREE.CylinderGeometry(0.8, 0.8, 8, 12);
        const neck = new THREE.Mesh(neckGeo, faucetBaseMat);
        neck.position.set(0, this.height + 6, -this.depth / 2 + 4);
        group.add(neck);

        // Faucet spout
        const spoutGeo = new THREE.CylinderGeometry(0.6, 0.6, 6, 12);
        const spout = new THREE.Mesh(spoutGeo, faucetBaseMat);
        spout.rotation.x = Math.PI / 2;
        spout.position.set(0, this.height + 9, -this.depth / 2 + 7);
        group.add(spout);
      }

      createHotWaterHeater3D(group, color) {
        const tankMat = new THREE.MeshStandardMaterial({ color, roughness: 0.6 });
        const metalMat = new THREE.MeshStandardMaterial({ color: 0x808080, roughness: 0.3, metalness: 0.7 });
        const pipeMat = new THREE.MeshStandardMaterial({ color: 0xcd7f32, roughness: 0.4, metalness: 0.6 });

        // Main tank (cylindrical)
        const tankRadius = Math.min(this.width, this.depth) / 2 - 1;
        const tankGeo = new THREE.CylinderGeometry(tankRadius, tankRadius, this.height - 6, 24);
        const tank = new THREE.Mesh(tankGeo, tankMat);
        tank.position.y = this.height / 2;
        group.add(tank);

        // Top dome
        const domeGeo = new THREE.SphereGeometry(tankRadius, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2);
        const dome = new THREE.Mesh(domeGeo, tankMat);
        dome.position.y = this.height - 3;
        group.add(dome);

        // Bottom cap
        const bottomGeo = new THREE.CylinderGeometry(tankRadius + 0.5, tankRadius + 0.5, 3, 24);
        const bottom = new THREE.Mesh(bottomGeo, metalMat);
        bottom.position.y = 1.5;
        group.add(bottom);

        // Water pipes on top
        const pipeGeo = new THREE.CylinderGeometry(1, 1, 6, 12);
        const coldPipe = new THREE.Mesh(pipeGeo, pipeMat);
        coldPipe.position.set(-3, this.height + 1, 0);
        group.add(coldPipe);

        const hotPipe = new THREE.Mesh(pipeGeo.clone(), pipeMat);
        hotPipe.position.set(3, this.height + 1, 0);
        group.add(hotPipe);

        // Temperature/pressure relief valve
        const valveGeo = new THREE.CylinderGeometry(0.8, 0.8, 3, 8);
        const valve = new THREE.Mesh(valveGeo, metalMat);
        valve.rotation.z = Math.PI / 2;
        valve.position.set(tankRadius + 1.5, this.height - 10, 0);
        group.add(valve);

        // Control panel
        const panelGeo = new THREE.BoxGeometry(6, 4, 0.5);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.5 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 10, tankRadius + 0.5);
        group.add(panel);

        // LED indicator
        const ledGeo = new THREE.CircleGeometry(0.5, 8);
        const ledMat = new THREE.MeshStandardMaterial({ color: 0x00ff00, emissive: 0x00ff00, emissiveIntensity: 0.5 });
        const led = new THREE.Mesh(ledGeo, ledMat);
        led.position.set(-1.5, 10, tankRadius + 0.6);
        group.add(led);
      }

      createMotorcycle3D(group, color) {
        // Royal Enfield Continental GT 650 - Detailed Model
        const frameMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.3, metalness: 0.8 });
        const tankMat = new THREE.MeshStandardMaterial({ color: 0x8B0000, roughness: 0.2, metalness: 0.6 }); // British Racing Red
        const chromeMat = new THREE.MeshStandardMaterial({ color: 0xd4d4d4, roughness: 0.1, metalness: 0.95 });
        const tireMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
        const seatMat = new THREE.MeshStandardMaterial({ color: 0x3d2314, roughness: 0.8 }); // Brown leather
        const engineMat = new THREE.MeshStandardMaterial({ color: 0x4a4a4a, roughness: 0.4, metalness: 0.7 });

        const wheelRadius = 10;
        const wheelWidth = 4;

        // Front wheel
        const wheelGeo = new THREE.TorusGeometry(wheelRadius, wheelWidth / 2, 16, 32);
        const frontWheel = new THREE.Mesh(wheelGeo, tireMat);
        frontWheel.rotation.y = Math.PI / 2;
        frontWheel.position.set(0, wheelRadius, this.depth / 2 - 12);
        group.add(frontWheel);

        // Front wheel hub/spokes
        const hubGeo = new THREE.CylinderGeometry(3, 3, wheelWidth + 1, 24);
        const frontHub = new THREE.Mesh(hubGeo, chromeMat);
        frontHub.rotation.z = Math.PI / 2;
        frontHub.position.copy(frontWheel.position);
        group.add(frontHub);

        // Front spokes (wire wheel style)
        for (let i = 0; i < 16; i++) {
          const angle = (i * Math.PI * 2) / 16;
          const spokeGeo = new THREE.CylinderGeometry(0.15, 0.15, wheelRadius - 2, 4);
          const spoke = new THREE.Mesh(spokeGeo, chromeMat);
          spoke.position.copy(frontWheel.position);
          spoke.position.y += Math.cos(angle) * (wheelRadius / 2);
          spoke.position.z += Math.sin(angle) * (wheelRadius / 2) * 0.1;
          spoke.rotation.z = angle;
          group.add(spoke);
        }

        // Rear wheel
        const rearWheel = new THREE.Mesh(wheelGeo.clone(), tireMat);
        rearWheel.rotation.y = Math.PI / 2;
        rearWheel.position.set(0, wheelRadius, -this.depth / 2 + 12);
        group.add(rearWheel);

        // Rear wheel hub
        const rearHub = new THREE.Mesh(hubGeo.clone(), chromeMat);
        rearHub.rotation.z = Math.PI / 2;
        rearHub.position.copy(rearWheel.position);
        group.add(rearHub);

        // Frame - Main tube
        const mainFrameGeo = new THREE.CylinderGeometry(1.2, 1.2, this.depth - 30, 12);
        const mainFrame = new THREE.Mesh(mainFrameGeo, frameMat);
        mainFrame.rotation.x = Math.PI / 2;
        mainFrame.position.set(0, wheelRadius + 8, 0);
        group.add(mainFrame);

        // Frame - Down tube
        const downTubeGeo = new THREE.CylinderGeometry(1, 1, 20, 12);
        const downTube = new THREE.Mesh(downTubeGeo, frameMat);
        downTube.rotation.x = Math.PI / 4;
        downTube.position.set(0, wheelRadius + 2, 5);
        group.add(downTube);

        // Fork tubes (front suspension)
        for (let side of [-1, 1]) {
          const forkGeo = new THREE.CylinderGeometry(1.2, 1.2, 22, 12);
          const fork = new THREE.Mesh(forkGeo, chromeMat);
          fork.rotation.x = 0.4;
          fork.position.set(side * 5, wheelRadius + 6, this.depth / 2 - 18);
          group.add(fork);
        }

        // Triple clamp
        const clampGeo = new THREE.BoxGeometry(14, 2, 4);
        const clamp = new THREE.Mesh(clampGeo, frameMat);
        clamp.position.set(0, wheelRadius + 16, this.depth / 2 - 14);
        group.add(clamp);

        // Handlebars (clip-ons)
        for (let side of [-1, 1]) {
          const barGeo = new THREE.CylinderGeometry(0.6, 0.6, 10, 12);
          const bar = new THREE.Mesh(barGeo, chromeMat);
          bar.rotation.z = Math.PI / 2;
          bar.rotation.y = 0.3 * side;
          bar.position.set(side * 10, wheelRadius + 18, this.depth / 2 - 12);
          group.add(bar);

          // Grips
          const gripGeo = new THREE.CylinderGeometry(0.9, 0.9, 4, 12);
          const gripMat = new THREE.MeshStandardMaterial({ color: 0x2d2d2d, roughness: 0.9 });
          const grip = new THREE.Mesh(gripGeo, gripMat);
          grip.rotation.z = Math.PI / 2;
          grip.position.set(side * 14, wheelRadius + 18, this.depth / 2 - 11);
          group.add(grip);
        }

        // Fuel tank (iconic Continental GT shape)
        const tankShape = new THREE.Shape();
        tankShape.moveTo(-7, 0);
        tankShape.quadraticCurveTo(-8, 6, -5, 9);
        tankShape.quadraticCurveTo(0, 10, 5, 9);
        tankShape.quadraticCurveTo(8, 6, 7, 0);
        tankShape.lineTo(-7, 0);

        const tankExtrudeSettings = { steps: 1, depth: 22, bevelEnabled: true, bevelThickness: 1, bevelSize: 1, bevelSegments: 3 };
        const tankGeometry = new THREE.ExtrudeGeometry(tankShape, tankExtrudeSettings);
        const tank = new THREE.Mesh(tankGeometry, tankMat);
        tank.rotation.x = -Math.PI / 2;
        tank.position.set(0, wheelRadius + 10, 8);
        group.add(tank);

        // Tank knee pads
        for (let side of [-1, 1]) {
          const padGeo = new THREE.BoxGeometry(1, 4, 8);
          const padMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.8 });
          const pad = new THREE.Mesh(padGeo, padMat);
          pad.position.set(side * 7, wheelRadius + 14, 5);
          group.add(pad);
        }

        // Tank cap
        const capGeo = new THREE.CylinderGeometry(2.5, 2.5, 1.5, 16);
        const cap = new THREE.Mesh(capGeo, chromeMat);
        cap.position.set(0, wheelRadius + 20, 5);
        group.add(cap);

        // Engine block (parallel twin 650cc)
        const engineGeo = new THREE.BoxGeometry(12, 12, 14);
        const engine = new THREE.Mesh(engineGeo, engineMat);
        engine.position.set(0, wheelRadius - 2, 0);
        group.add(engine);

        // Cylinder heads
        for (let side of [-1, 1]) {
          const headGeo = new THREE.BoxGeometry(4, 8, 12);
          const head = new THREE.Mesh(headGeo, engineMat);
          head.position.set(side * 8, wheelRadius + 2, 0);
          group.add(head);

          // Exhaust headers
          const headerGeo = new THREE.CylinderGeometry(1.2, 1.2, 15, 12);
          const header = new THREE.Mesh(headerGeo, chromeMat);
          header.rotation.z = Math.PI / 2 * side;
          header.rotation.y = 0.3;
          header.position.set(side * 12, wheelRadius - 4, 3);
          group.add(header);
        }

        // Exhaust pipes (twin upswept)
        for (let side of [-1, 1]) {
          const pipeGeo = new THREE.CylinderGeometry(1.5, 1.8, 30, 12);
          const pipe = new THREE.Mesh(pipeGeo, chromeMat);
          pipe.rotation.x = Math.PI / 2;
          pipe.rotation.z = 0.15 * side;
          pipe.position.set(side * 10, wheelRadius - 2, -18);
          group.add(pipe);

          // Muffler
          const mufflerGeo = new THREE.CylinderGeometry(2.5, 2.5, 12, 16);
          const muffler = new THREE.Mesh(mufflerGeo, chromeMat);
          muffler.rotation.x = Math.PI / 2;
          muffler.position.set(side * 10, wheelRadius, -this.depth / 2 + 10);
          group.add(muffler);
        }

        // Seat (cafe racer hump)
        const seatGeo = new THREE.BoxGeometry(8, 4, 24);
        const seat = new THREE.Mesh(seatGeo, seatMat);
        seat.position.set(0, wheelRadius + 12, -8);
        group.add(seat);

        // Seat cowl/hump
        const cowlShape = new THREE.Shape();
        cowlShape.moveTo(-4, 0);
        cowlShape.quadraticCurveTo(-4, 6, 0, 8);
        cowlShape.quadraticCurveTo(4, 6, 4, 0);
        cowlShape.lineTo(-4, 0);

        const cowlSettings = { steps: 1, depth: 10, bevelEnabled: true, bevelThickness: 0.5, bevelSize: 0.5, bevelSegments: 2 };
        const cowlGeometry = new THREE.ExtrudeGeometry(cowlShape, cowlSettings);
        const cowl = new THREE.Mesh(cowlGeometry, seatMat);
        cowl.rotation.x = -Math.PI / 2;
        cowl.position.set(0, wheelRadius + 12, -14);
        group.add(cowl);

        // Rear fender
        const fenderGeo = new THREE.BoxGeometry(10, 1, 16);
        const fender = new THREE.Mesh(fenderGeo, frameMat);
        fender.position.set(0, wheelRadius + 4, -this.depth / 2 + 14);
        group.add(fender);

        // Tail light
        const tailGeo = new THREE.CylinderGeometry(1.5, 1.5, 3, 12);
        const tailMat = new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0x330000, roughness: 0.5 });
        const tail = new THREE.Mesh(tailGeo, tailMat);
        tail.rotation.z = Math.PI / 2;
        tail.position.set(0, wheelRadius + 8, -this.depth / 2 + 5);
        group.add(tail);

        // Headlight (classic round)
        const headlightGeo = new THREE.SphereGeometry(4, 16, 16, 0, Math.PI);
        const headlightMat = new THREE.MeshStandardMaterial({ color: 0xffffcc, emissive: 0x333300, roughness: 0.3 });
        const headlight = new THREE.Mesh(headlightGeo, headlightMat);
        headlight.rotation.x = Math.PI / 2;
        headlight.position.set(0, wheelRadius + 14, this.depth / 2 - 8);
        group.add(headlight);

        // Headlight housing
        const housingGeo = new THREE.CylinderGeometry(4.5, 4.5, 4, 24);
        const housing = new THREE.Mesh(housingGeo, chromeMat);
        housing.rotation.x = Math.PI / 2;
        housing.position.set(0, wheelRadius + 14, this.depth / 2 - 10);
        group.add(housing);

        // Mirrors
        for (let side of [-1, 1]) {
          const mirrorArmGeo = new THREE.CylinderGeometry(0.3, 0.3, 6, 8);
          const mirrorArm = new THREE.Mesh(mirrorArmGeo, frameMat);
          mirrorArm.rotation.z = Math.PI / 4 * side;
          mirrorArm.position.set(side * 12, wheelRadius + 22, this.depth / 2 - 10);
          group.add(mirrorArm);

          const mirrorGeo = new THREE.CircleGeometry(2, 16);
          const mirrorMat = new THREE.MeshStandardMaterial({ color: 0xaaaaaa, roughness: 0.1, metalness: 0.9 });
          const mirror = new THREE.Mesh(mirrorGeo, mirrorMat);
          mirror.rotation.y = Math.PI / 2 * side;
          mirror.position.set(side * 14, wheelRadius + 24, this.depth / 2 - 10);
          group.add(mirror);
        }

        // Footpegs
        for (let side of [-1, 1]) {
          const pegGeo = new THREE.CylinderGeometry(0.6, 0.6, 4, 8);
          const peg = new THREE.Mesh(pegGeo, chromeMat);
          peg.rotation.z = Math.PI / 2;
          peg.position.set(side * 10, wheelRadius - 6, -5);
          group.add(peg);
        }

        // Kickstand
        const standGeo = new THREE.CylinderGeometry(0.5, 0.5, 14, 8);
        const stand = new THREE.Mesh(standGeo, frameMat);
        stand.rotation.z = 0.5;
        stand.rotation.y = 0.3;
        stand.position.set(-8, 5, -5);
        group.add(stand);

        // Swing arm
        const swingGeo = new THREE.BoxGeometry(4, 3, 20);
        const swing = new THREE.Mesh(swingGeo, frameMat);
        swing.position.set(0, wheelRadius, -this.depth / 2 + 22);
        group.add(swing);

        // Rear shock absorbers
        for (let side of [-1, 1]) {
          const shockGeo = new THREE.CylinderGeometry(1.2, 0.8, 12, 12);
          const shock = new THREE.Mesh(shockGeo, chromeMat);
          shock.rotation.x = 0.3;
          shock.position.set(side * 6, wheelRadius + 4, -this.depth / 2 + 18);
          group.add(shock);
        }
      }

      createElectricalPanel3D(group, color) {
        // Main panel box
        const panelGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const panelMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.6 });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.y = this.height / 2;
        group.add(panel);

        // Door
        const doorGeo = new THREE.BoxGeometry(this.width - 1, this.height - 2, 0.5);
        const doorMat = new THREE.MeshStandardMaterial({ color: 0x374151, roughness: 0.5 });
        const door = new THREE.Mesh(doorGeo, doorMat);
        door.position.set(0, this.height / 2, this.depth / 2 + 0.3);
        group.add(door);

        // Breakers (rows of toggles)
        const breakerMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.4 });
        const onMat = new THREE.MeshStandardMaterial({ color: 0x22c55e, roughness: 0.4 });
        const offMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });

        for (let row = 0; row < 4; row++) {
          for (let col = 0; col < 2; col++) {
            const breakerGeo = new THREE.BoxGeometry(2.5, 2, 1);
            const breaker = new THREE.Mesh(breakerGeo, breakerMat);
            breaker.position.set(
              (col - 0.5) * 4,
              this.height - 5 - row * 5,
              this.depth / 2 + 0.8
            );
            group.add(breaker);

            // Toggle indicator
            const indicatorGeo = new THREE.BoxGeometry(0.8, 0.8, 0.3);
            const indicator = new THREE.Mesh(indicatorGeo, row === 3 ? offMat : onMat);
            indicator.position.set(
              (col - 0.5) * 4,
              this.height - 5 - row * 5 + 0.6,
              this.depth / 2 + 1.4
            );
            group.add(indicator);
          }
        }

        // Main breaker at top
        const mainGeo = new THREE.BoxGeometry(6, 3, 1.2);
        const mainMat = new THREE.MeshStandardMaterial({ color: 0xef4444, roughness: 0.4 });
        const main = new THREE.Mesh(mainGeo, mainMat);
        main.position.set(0, this.height - 2, this.depth / 2 + 0.8);
        group.add(main);

        // Wire connection points on sides
        const connMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
        for (let i = 0; i < 3; i++) {
          const connGeo = new THREE.CylinderGeometry(0.5, 0.5, 1, 8);
          const conn = new THREE.Mesh(connGeo, connMat);
          conn.rotation.z = Math.PI / 2;
          conn.position.set(this.width / 2 + 0.5, this.height - 8 - i * 8, 0);
          group.add(conn);
        }
      }

      createJunctionBox3D(group, color) {
        // Main box
        const boxGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const boxMat = new THREE.MeshStandardMaterial({ color: 0x6b7280, roughness: 0.6 });
        const box = new THREE.Mesh(boxGeo, boxMat);
        box.position.y = this.height / 2;
        group.add(box);

        // Cover plate
        const coverGeo = new THREE.BoxGeometry(this.width - 0.5, this.height - 0.5, 0.3);
        const coverMat = new THREE.MeshStandardMaterial({ color: 0x4b5563, roughness: 0.5 });
        const cover = new THREE.Mesh(coverGeo, coverMat);
        cover.position.set(0, this.height / 2, this.depth / 2 + 0.2);
        group.add(cover);

        // Screws on corners
        const screwMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 });
        const positions = [[-1, 1], [1, 1], [-1, -1], [1, -1]];
        positions.forEach(([x, y]) => {
          const screwGeo = new THREE.CylinderGeometry(0.2, 0.2, 0.3, 8);
          const screw = new THREE.Mesh(screwGeo, screwMat);
          screw.rotation.x = Math.PI / 2;
          screw.position.set(x * (this.width / 2 - 0.5), this.height / 2 + y * (this.height / 2 - 0.5), this.depth / 2 + 0.4);
          group.add(screw);
        });

        // Wire entry knockouts (circles on each side)
        const knockoutMat = new THREE.MeshStandardMaterial({ color: 0xffcc00, roughness: 0.5 });
        // Top and bottom
        for (let z of [-1, 1]) {
          const knockoutGeo = new THREE.CylinderGeometry(0.4, 0.4, 0.5, 8);
          const knockout = new THREE.Mesh(knockoutGeo, knockoutMat);
          knockout.position.set(0, this.height / 2, z * (this.depth / 2 + 0.25));
          knockout.rotation.x = Math.PI / 2;
          group.add(knockout);
        }
      }

      createOutlet3D(group, color) {
        // Wall plate
        const plateGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = this.height / 2;
        group.add(plate);

        // Outlet face
        const faceMat = new THREE.MeshStandardMaterial({ color: 0xe5e7eb, roughness: 0.4 });

        // Top outlet
        const socket1Geo = new THREE.BoxGeometry(1.8, 1.2, 0.3);
        const socket1 = new THREE.Mesh(socket1Geo, faceMat);
        socket1.position.set(0, this.height * 0.7, this.depth / 2 + 0.2);
        group.add(socket1);

        // Slots for top outlet
        const slotMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.5 });
        for (let x of [-0.4, 0.4]) {
          const slotGeo = new THREE.BoxGeometry(0.15, 0.6, 0.2);
          const slot = new THREE.Mesh(slotGeo, slotMat);
          slot.position.set(x, this.height * 0.7, this.depth / 2 + 0.35);
          group.add(slot);
        }

        // Ground hole
        const groundGeo = new THREE.CylinderGeometry(0.15, 0.15, 0.2, 8);
        const ground = new THREE.Mesh(groundGeo, slotMat);
        ground.rotation.x = Math.PI / 2;
        ground.position.set(0, this.height * 0.7 - 0.4, this.depth / 2 + 0.35);
        group.add(ground);

        // Bottom outlet
        const socket2 = new THREE.Mesh(socket1Geo, faceMat);
        socket2.position.set(0, this.height * 0.3, this.depth / 2 + 0.2);
        group.add(socket2);

        for (let x of [-0.4, 0.4]) {
          const slotGeo = new THREE.BoxGeometry(0.15, 0.6, 0.2);
          const slot = new THREE.Mesh(slotGeo, slotMat);
          slot.position.set(x, this.height * 0.3, this.depth / 2 + 0.35);
          group.add(slot);
        }

        const ground2 = new THREE.Mesh(groundGeo, slotMat);
        ground2.rotation.x = Math.PI / 2;
        ground2.position.set(0, this.height * 0.3 - 0.4, this.depth / 2 + 0.35);
        group.add(ground2);

        // Center screw
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8);
        const screwMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 });
        const screw = new THREE.Mesh(screwGeo, screwMat);
        screw.rotation.x = Math.PI / 2;
        screw.position.set(0, this.height / 2, this.depth / 2 + 0.3);
        group.add(screw);
      }

      createLightSwitch3D(group, color) {
        // Wall plate
        const plateGeo = new THREE.BoxGeometry(this.width, this.height, this.depth);
        const plateMat = new THREE.MeshStandardMaterial({ color: 0xf5f5f5, roughness: 0.3 });
        const plate = new THREE.Mesh(plateGeo, plateMat);
        plate.position.y = this.height / 2;
        group.add(plate);

        // Switch toggle area
        const toggleAreaGeo = new THREE.BoxGeometry(1.5, 2.5, 0.3);
        const toggleAreaMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, roughness: 0.4 });
        const toggleArea = new THREE.Mesh(toggleAreaGeo, toggleAreaMat);
        toggleArea.position.set(0, this.height / 2, this.depth / 2 + 0.2);
        group.add(toggleArea);

        // Toggle switch (up position = on)
        const toggleGeo = new THREE.BoxGeometry(1.2, 1, 0.4);
        const toggleMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 });
        const toggle = new THREE.Mesh(toggleGeo, toggleMat);
        toggle.rotation.x = -0.3; // Tilted up
        toggle.position.set(0, this.height / 2 + 0.3, this.depth / 2 + 0.5);
        group.add(toggle);

        // Top and bottom screws
        const screwGeo = new THREE.CylinderGeometry(0.12, 0.12, 0.15, 8);
        const screwMat = new THREE.MeshStandardMaterial({ color: 0x9ca3af, roughness: 0.3 });

        const screwTop = new THREE.Mesh(screwGeo, screwMat);
        screwTop.rotation.x = Math.PI / 2;
        screwTop.position.set(0, this.height * 0.85, this.depth / 2 + 0.3);
        group.add(screwTop);

        const screwBottom = new THREE.Mesh(screwGeo, screwMat);
        screwBottom.rotation.x = Math.PI / 2;
        screwBottom.position.set(0, this.height * 0.15, this.depth / 2 + 0.3);
        group.add(screwBottom);
      }

      remove() {
        if (this.mesh) scene.remove(this.mesh);
        if (this.mesh3D) scene.remove(this.mesh3D);
      }

      setSelected(selected) {
        this.selected = selected;
        if (this.mesh) {
          this.mesh.material.color.setHex(selected ? 0xff006e : 0x95d5b2);
        }
        if (this.mesh3D) {
          // Recreate the 3D mesh with selection color
          if (state.currentView === '3d') {
            this.create3DMesh();
          }
        }
      }
    }

    // ============================================
    // DIMENSION CLASS
    // ============================================

    class Dimension {
      constructor(start, end) {
        this.id = Date.now() + Math.random();
        this.start = { ...start };
        this.end = { ...end };
        this.mesh = null;
        this.labelDiv = null;
        this.selected = false;
      }

      get length() {
        return calculateDistance(this.start, this.end);
      }

      get midpoint() {
        return {
          x: (this.start.x + this.end.x) / 2,
          y: (this.start.y + this.end.y) / 2
        };
      }

      createMesh() {
        if (this.mesh) scene.remove(this.mesh);
        if (this.labelDiv) this.labelDiv.remove();

        const group = new THREE.Group();

        // Main line
        const lineGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(this.start.x, 0.5, this.start.y),
          new THREE.Vector3(this.end.x, 0.5, this.end.y)
        ]);
        const lineMaterial = new THREE.LineBasicMaterial({
          color: this.selected ? 0xff006e : 0xffcc00
        });
        const line = new THREE.Line(lineGeometry, lineMaterial);
        group.add(line);

        // End caps (small perpendicular lines)
        const angle = Math.atan2(this.end.y - this.start.y, this.end.x - this.start.x);
        const perpX = Math.sin(angle) * 5;
        const perpY = -Math.cos(angle) * 5;

        const startCapGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(this.start.x - perpX, 0.5, this.start.y - perpY),
          new THREE.Vector3(this.start.x + perpX, 0.5, this.start.y + perpY)
        ]);
        const startCap = new THREE.Line(startCapGeometry, lineMaterial);
        group.add(startCap);

        const endCapGeometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(this.end.x - perpX, 0.5, this.end.y - perpY),
          new THREE.Vector3(this.end.x + perpX, 0.5, this.end.y + perpY)
        ]);
        const endCap = new THREE.Line(endCapGeometry, lineMaterial);
        group.add(endCap);

        group.userData = { type: 'dimension', id: this.id };
        this.mesh = group;
        scene.add(group);

        // Create label
        this.labelDiv = document.createElement('div');
        this.labelDiv.className = 'dimension-label';
        this.labelDiv.textContent = formatMeasurement(this.length);
        labelsContainer.appendChild(this.labelDiv);

        this.updateLabelPosition();
        return group;
      }

      updateLabelPosition() {
        if (!this.labelDiv) return;

        const screenPos = worldToScreen(this.midpoint.x, this.midpoint.y);
        const rect = canvasContainer.getBoundingClientRect();
        this.labelDiv.style.left = `${screenPos.x - rect.left}px`;
        this.labelDiv.style.top = `${screenPos.y - rect.top - 15}px`;
      }

      remove() {
        if (this.mesh) scene.remove(this.mesh);
        if (this.labelDiv) this.labelDiv.remove();
      }

      setSelected(selected) {
        this.selected = selected;
        if (this.mesh) {
          this.mesh.children.forEach(child => {
            if (child.material) {
              child.material.color.setHex(selected ? 0xff006e : 0xffcc00);
            }
          });
        }
      }
    }

    // ============================================
    // ANNOTATION CLASS
    // ============================================

    class Annotation {
      constructor(position, text) {
        this.id = Date.now() + Math.random();
        this.position = { ...position };
        this.text = text;
        this.labelDiv = null;
        this.selected = false;
      }

      createMesh() {
        if (this.labelDiv) this.labelDiv.remove();

        this.labelDiv = document.createElement('div');
        this.labelDiv.className = 'dimension-label';
        this.labelDiv.style.background = this.selected ? 'rgba(255, 0, 110, 0.9)' : 'rgba(149, 213, 178, 0.9)';
        this.labelDiv.style.color = this.selected ? 'white' : '#0c0c0c';
        this.labelDiv.textContent = this.text;
        labelsContainer.appendChild(this.labelDiv);

        this.updateLabelPosition();
      }

      updateLabelPosition() {
        if (!this.labelDiv) return;

        const screenPos = worldToScreen(this.position.x, this.position.y);
        const rect = canvasContainer.getBoundingClientRect();
        this.labelDiv.style.left = `${screenPos.x - rect.left}px`;
        this.labelDiv.style.top = `${screenPos.y - rect.top}px`;
      }

      remove() {
        if (this.labelDiv) this.labelDiv.remove();
      }

      setSelected(selected) {
        this.selected = selected;
        if (this.labelDiv) {
          this.labelDiv.style.background = selected ? 'rgba(255, 0, 110, 0.9)' : 'rgba(149, 213, 178, 0.9)';
          this.labelDiv.style.color = selected ? 'white' : '#0c0c0c';
        }
      }
    }

    // ============================================
    // WIRE CLASS
    // ============================================

    class Wire {
      constructor(points, wireType = 'electrical') {
        this.id = Date.now() + Math.random();
        this.points = points.map(p => ({ ...p })); // Array of {x, y} points
        this.wireType = wireType; // 'electrical', 'data', 'speaker', 'low-voltage'
        this.mesh = null;
        this.mesh3D = null;
        this.selected = false;
        // Check for connections at endpoints
        this.startConnection = this.findConnectionAt(this.points[0]);
        this.endConnection = this.findConnectionAt(this.points[this.points.length - 1]);
      }

      findConnectionAt(point) {
        for (const furniture of data.furniture) {
          if (ELECTRICAL_TYPES && ELECTRICAL_TYPES.includes(furniture.type)) {
            const dist = calculateDistance(point, furniture.position);
            if (dist < 5) {
              return furniture.id;
            }
          }
        }
        return null;
      }

      get color() {
        const colors = {
          'electrical': 0xffcc00,    // Yellow
          'data': 0x3b82f6,          // Blue
          'speaker': 0x22c55e,       // Green
          'low-voltage': 0xf97316,   // Orange
          'conduit': 0x6b7280        // Gray
        };
        return colors[this.wireType] || 0xffcc00;
      }

      get height() {
        // Height in wall for 3D rendering
        return this.wireType === 'electrical' ? 48 : 12; // Electrical at 4ft, others at 1ft
      }

      create2DMesh() {
        if (this.mesh) scene.remove(this.mesh);

        if (this.points.length < 2) return;

        const linePoints = this.points.map(p => new THREE.Vector3(p.x, 0.6, p.y));
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);

        // Dashed line for wiring
        const material = new THREE.LineDashedMaterial({
          color: this.selected ? 0xff006e : this.color,
          dashSize: 6,
          gapSize: 3,
          linewidth: 2
        });

        this.mesh = new THREE.Line(geometry, material);
        this.mesh.computeLineDistances(); // Required for dashed lines
        this.mesh.userData = { type: 'wire', id: this.id };
        scene.add(this.mesh);

        // Add junction points at each vertex
        this.points.forEach((point, index) => {
          const isEndpoint = index === 0 || index === this.points.length - 1;
          const isConnected = (index === 0 && this.startConnection) ||
                              (index === this.points.length - 1 && this.endConnection);

          // Connected endpoints show larger green circles
          const radius = isConnected ? 5 : (isEndpoint ? 4 : 3);
          const color = this.selected ? 0xff006e : (isConnected ? 0x22c55e : this.color);

          const circleGeo = new THREE.CircleGeometry(radius, 16);
          const circleMat = new THREE.MeshBasicMaterial({
            color: color,
            side: THREE.DoubleSide
          });
          const circle = new THREE.Mesh(circleGeo, circleMat);
          circle.position.set(point.x, 0.65, point.y);
          circle.rotation.x = -Math.PI / 2;
          circle.userData = { type: 'wire-point', wireId: this.id, pointIndex: index };
          this.mesh.add(circle);

          // Add connection indicator ring for connected endpoints
          if (isConnected && !this.selected) {
            const ringGeo = new THREE.RingGeometry(6, 8, 16);
            const ringMat = new THREE.MeshBasicMaterial({
              color: 0x22c55e,
              side: THREE.DoubleSide,
              transparent: true,
              opacity: 0.4
            });
            const ring = new THREE.Mesh(ringGeo, ringMat);
            ring.position.set(point.x, 0.66, point.y);
            ring.rotation.x = -Math.PI / 2;
            this.mesh.add(ring);
          }
        });
      }

      create3DMesh() {
        if (this.mesh3D) scene.remove(this.mesh3D);

        if (this.points.length < 2) return;

        const group = new THREE.Group();
        const wireRadius = 0.5;
        const wireHeight = this.height;

        // Create tube along the wire path
        for (let i = 0; i < this.points.length - 1; i++) {
          const p1 = this.points[i];
          const p2 = this.points[i + 1];

          const dx = p2.x - p1.x;
          const dy = p2.y - p1.y;
          const length = Math.sqrt(dx * dx + dy * dy);
          const angle = Math.atan2(dy, dx);

          // Wire segment
          const geometry = new THREE.CylinderGeometry(wireRadius, wireRadius, length, 8);
          const material = new THREE.MeshStandardMaterial({
            color: this.selected ? 0xff006e : this.color,
            roughness: 0.6
          });
          const segment = new THREE.Mesh(geometry, material);

          // Position and rotate
          segment.rotation.z = Math.PI / 2;
          segment.rotation.y = -angle;
          segment.position.set(
            (p1.x + p2.x) / 2,
            wireHeight,
            (p1.y + p2.y) / 2
          );
          group.add(segment);
        }

        // Add junction boxes at bend points and endpoint markers
        this.points.forEach((point, index) => {
          const isStartPoint = index === 0;
          const isEndPoint = index === this.points.length - 1;
          const isConnected = (isStartPoint && this.startConnection) ||
                              (isEndPoint && this.endConnection);

          if (!isStartPoint && !isEndPoint) {
            // Junction box at bends
            const boxGeo = new THREE.BoxGeometry(3, 3, 3);
            const boxMat = new THREE.MeshStandardMaterial({
              color: 0x4b5563,
              roughness: 0.5
            });
            const box = new THREE.Mesh(boxGeo, boxMat);
            box.position.set(point.x, wireHeight, point.y);
            group.add(box);
          } else if (isConnected) {
            // Connected endpoint - show as connector attached to electrical box
            const connectorGeo = new THREE.CylinderGeometry(1.5, 1.5, 2, 12);
            const connectorMat = new THREE.MeshStandardMaterial({
              color: 0x22c55e,
              roughness: 0.4,
              metalness: 0.3
            });
            const connector = new THREE.Mesh(connectorGeo, connectorMat);
            connector.position.set(point.x, wireHeight, point.y);
            group.add(connector);

            // Add wire coming out of connector
            const wireOutGeo = new THREE.CylinderGeometry(0.3, 0.3, 3, 8);
            const wireOut = new THREE.Mesh(wireOutGeo, new THREE.MeshStandardMaterial({
              color: this.color,
              roughness: 0.5
            }));
            wireOut.position.set(point.x, wireHeight + 2.5, point.y);
            group.add(wireOut);
          } else {
            // Unconnected endpoint - just a sphere marker
            const sphereGeo = new THREE.SphereGeometry(2, 16, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
              color: this.color,
              roughness: 0.4
            });
            const sphere = new THREE.Mesh(sphereGeo, sphereMat);
            sphere.position.set(point.x, wireHeight, point.y);
            group.add(sphere);
          }
        });

        group.userData = { type: 'wire', id: this.id };
        this.mesh3D = group;
        scene.add(this.mesh3D);
      }

      remove() {
        if (this.mesh) {
          // Remove all children first
          while (this.mesh.children.length > 0) {
            const child = this.mesh.children[0];
            this.mesh.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
          if (this.mesh.geometry) this.mesh.geometry.dispose();
          if (this.mesh.material) this.mesh.material.dispose();
          scene.remove(this.mesh);
          this.mesh = null;
        }
        if (this.mesh3D) {
          // Remove all children from group
          while (this.mesh3D.children.length > 0) {
            const child = this.mesh3D.children[0];
            this.mesh3D.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
          }
          scene.remove(this.mesh3D);
          this.mesh3D = null;
        }
      }

      setSelected(selected) {
        this.selected = selected;
        this.create2DMesh();
        if (state.currentView === '3d') {
          this.create3DMesh();
        }
      }

      distanceToPoint(point) {
        let minDist = Infinity;
        for (let i = 0; i < this.points.length - 1; i++) {
          const p1 = this.points[i];
          const p2 = this.points[i + 1];
          const dist = this.pointToSegmentDistance(point, p1, p2);
          if (dist < minDist) minDist = dist;
        }
        return minDist;
      }

      pointToSegmentDistance(point, p1, p2) {
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const lengthSq = dx * dx + dy * dy;

        if (lengthSq === 0) return calculateDistance(point, p1);

        let t = ((point.x - p1.x) * dx + (point.y - p1.y) * dy) / lengthSq;
        t = Math.max(0, Math.min(1, t));

        const projX = p1.x + t * dx;
        const projY = p1.y + t * dy;

        return calculateDistance(point, { x: projX, y: projY });
      }
    }

    // ============================================
    // TEMPORARY DRAWING ELEMENTS
    // ============================================

    let tempWallMesh = null;
    let tempDimensionLabel = null;
    let tempShapeLines = [];
    let tempPenStroke = null;
    let tempControlPoints = [];
    let tempSimplifiedLines = [];
    let tempRectPreview = null;
    let tempRectLabels = [];
    let tempWireLine = null;
    let tempWirePoints = [];

    function createTempWall(start, end) {
      if (tempWallMesh) scene.remove(tempWallMesh);

      const length = calculateDistance(start, end);
      if (length < 1) return;

      const thickness = state.defaultWallThickness;
      const geometry = new THREE.PlaneGeometry(length, thickness);
      const material = new THREE.MeshBasicMaterial({
        color: 0x00d4ff,
        opacity: 0.6,
        transparent: true,
        side: THREE.DoubleSide
      });

      tempWallMesh = new THREE.Mesh(geometry, material);

      const midX = (start.x + end.x) / 2;
      const midY = (start.y + end.y) / 2;
      const angle = Math.atan2(end.y - start.y, end.x - start.x);

      tempWallMesh.position.set(midX, 0.1, midY);
      tempWallMesh.rotation.x = -Math.PI / 2;
      tempWallMesh.rotation.z = -angle;

      scene.add(tempWallMesh);
    }

    function removeTempWall() {
      if (tempWallMesh) {
        scene.remove(tempWallMesh);
        tempWallMesh = null;
      }
    }

    // Rectangle preview for room drawing
    function updateRectPreview(start, end) {
      clearRectPreview();

      if (!start || !end) return;

      const thickness = state.defaultWallThickness;

      // Create rectangle outline with 4 walls
      const corners = [
        { x: start.x, y: start.y },
        { x: end.x, y: start.y },
        { x: end.x, y: end.y },
        { x: start.x, y: end.y }
      ];

      // Create lines for each edge
      const group = new THREE.Group();

      for (let i = 0; i < 4; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 4];

        const length = calculateDistance(c1, c2);
        if (length < 1) continue;

        const geometry = new THREE.PlaneGeometry(length, thickness);
        const material = new THREE.MeshBasicMaterial({
          color: 0x00d4ff,
          opacity: 0.6,
          transparent: true,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);

        const midX = (c1.x + c2.x) / 2;
        const midY = (c1.y + c2.y) / 2;
        const angle = Math.atan2(c2.y - c1.y, c2.x - c1.x);

        mesh.position.set(midX, 0.1, midY);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -angle;

        group.add(mesh);
      }

      // Add dashed marquee outline
      const outlinePoints = corners.map(c => new THREE.Vector3(c.x, 0.15, c.y));
      outlinePoints.push(outlinePoints[0].clone());
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
      const outlineMaterial = new THREE.LineDashedMaterial({
        color: 0xffcc00,
        dashSize: 8,
        gapSize: 4
      });
      const outline = new THREE.Line(outlineGeometry, outlineMaterial);
      outline.computeLineDistances();
      group.add(outline);

      tempRectPreview = group;
      scene.add(tempRectPreview);

      // Update dimension labels
      updateRectDimensionLabels(start, end);
    }

    function updateRectDimensionLabels(start, end) {
      clearRectLabels();

      const width = Math.abs(end.x - start.x);
      const height = Math.abs(end.y - start.y);

      // Width label (top)
      const widthLabel = document.createElement('div');
      widthLabel.className = 'dimension-label';
      widthLabel.textContent = formatMeasurement(width);
      widthLabel.style.pointerEvents = 'none';
      labelsContainer.appendChild(widthLabel);
      tempRectLabels.push(widthLabel);

      const topMidX = (start.x + end.x) / 2;
      const topY = Math.min(start.y, end.y) - 15;
      const topScreenPos = worldToScreen(topMidX, topY);
      widthLabel.style.left = `${topScreenPos.x}px`;
      widthLabel.style.top = `${topScreenPos.y}px`;
      widthLabel.style.transform = 'translate(-50%, -50%)';

      // Height label (left)
      const heightLabel = document.createElement('div');
      heightLabel.className = 'dimension-label';
      heightLabel.textContent = formatMeasurement(height);
      heightLabel.style.pointerEvents = 'none';
      labelsContainer.appendChild(heightLabel);
      tempRectLabels.push(heightLabel);

      const leftX = Math.min(start.x, end.x) - 15;
      const leftMidY = (start.y + end.y) / 2;
      const leftScreenPos = worldToScreen(leftX, leftMidY);
      heightLabel.style.left = `${leftScreenPos.x}px`;
      heightLabel.style.top = `${leftScreenPos.y}px`;
      heightLabel.style.transform = 'translate(-50%, -50%)';
    }

    function clearRectPreview() {
      if (tempRectPreview) {
        scene.remove(tempRectPreview);
        tempRectPreview = null;
      }
    }

    function clearRectLabels() {
      tempRectLabels.forEach(label => label.remove());
      tempRectLabels = [];
    }

    // Electrical object types that wires can connect to
    const ELECTRICAL_TYPES = ['electrical-panel', 'junction-box', 'outlet', 'light-switch'];

    function findNearbyElectricalObject(worldPos, maxDistance = 15) {
      let nearestObj = null;
      let minDist = maxDistance;

      for (const furniture of data.furniture) {
        if (ELECTRICAL_TYPES.includes(furniture.type)) {
          const dist = calculateDistance(worldPos, furniture.position);
          if (dist < minDist) {
            minDist = dist;
            nearestObj = furniture;
          }
        }
      }

      return nearestObj;
    }

    function getElectricalSnapPoint(worldPos) {
      const electrical = findNearbyElectricalObject(worldPos);
      if (electrical) {
        return { ...electrical.position };
      }
      return null;
    }

    // Wire drawing functions
    function updateTempWireLine() {
      clearTempWireLine();

      if (state.wirePoints.length < 1) return;

      // Draw the placed points and line
      const linePoints = state.wirePoints.map(p => new THREE.Vector3(p.x, 0.7, p.y));

      if (linePoints.length >= 2) {
        const geometry = new THREE.BufferGeometry().setFromPoints(linePoints);
        const wireType = document.getElementById('wire-type').value;
        const colors = {
          'electrical': 0xffcc00,
          'data': 0x3b82f6,
          'speaker': 0x22c55e,
          'low-voltage': 0xf97316,
          'conduit': 0x6b7280
        };
        const material = new THREE.LineDashedMaterial({
          color: colors[wireType] || 0xffcc00,
          dashSize: 6,
          gapSize: 3,
          linewidth: 2
        });

        tempWireLine = new THREE.Line(geometry, material);
        tempWireLine.computeLineDistances();
        scene.add(tempWireLine);
      }

      // Draw junction points
      tempWirePoints.forEach(p => scene.remove(p));
      tempWirePoints = [];

      state.wirePoints.forEach((point, index) => {
        // Check if this point is connected to an electrical object
        const connectedElectrical = findNearbyElectricalObject(point, 5);
        const isConnected = connectedElectrical !== null;

        const circleGeo = new THREE.CircleGeometry(isConnected ? 6 : 4, 16);
        const wireType = document.getElementById('wire-type').value;
        const colors = {
          'electrical': 0xffcc00,
          'data': 0x3b82f6,
          'speaker': 0x22c55e,
          'low-voltage': 0xf97316,
          'conduit': 0x6b7280
        };
        // Connected points show green, unconnected show wire color
        const circleMat = new THREE.MeshBasicMaterial({
          color: isConnected ? 0x22c55e : (colors[wireType] || 0xffcc00),
          side: THREE.DoubleSide
        });
        const circle = new THREE.Mesh(circleGeo, circleMat);
        circle.position.set(point.x, 0.75, point.y);
        circle.rotation.x = -Math.PI / 2;
        scene.add(circle);
        tempWirePoints.push(circle);

        // Add connection ring for connected points
        if (isConnected) {
          const ringGeo = new THREE.RingGeometry(7, 9, 16);
          const ringMat = new THREE.MeshBasicMaterial({
            color: 0x22c55e,
            side: THREE.DoubleSide,
            transparent: true,
            opacity: 0.5
          });
          const ring = new THREE.Mesh(ringGeo, ringMat);
          ring.position.set(point.x, 0.76, point.y);
          ring.rotation.x = -Math.PI / 2;
          scene.add(ring);
          tempWirePoints.push(ring);
        }
      });
    }

    function clearTempWireLine() {
      if (tempWireLine) {
        scene.remove(tempWireLine);
        tempWireLine = null;
      }
      tempWirePoints.forEach(p => scene.remove(p));
      tempWirePoints = [];
    }

    function finishWireDrawing() {
      if (state.wirePoints.length >= 2) {
        const wireType = document.getElementById('wire-type').value;
        const wire = new Wire(state.wirePoints, wireType);
        data.wires.push(wire);
        wire.create2DMesh();
        if (state.currentView === '3d') {
          wire.create3DMesh();
        }
        saveHistory();
      }

      clearTempWireLine();
      state.isDrawingWire = false;
      state.wirePoints = [];
    }

    function createRectangleWalls(start, end) {
      const corners = [
        snapPointToGrid({ x: start.x, y: start.y }),
        snapPointToGrid({ x: end.x, y: start.y }),
        snapPointToGrid({ x: end.x, y: end.y }),
        snapPointToGrid({ x: start.x, y: end.y })
      ];

      // Create 4 walls connecting the corners
      for (let i = 0; i < 4; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % 4];

        const length = calculateDistance(c1, c2);
        if (length < 5) continue;

        const wall = new Wall(c1, c2, state.defaultWallThickness, state.defaultWallHeight);
        data.walls.push(wall);
        wall.create2DMesh();
      }

      renderAll();
      saveHistory();
    }

    // Pen stroke rendering (freehand line while drawing)
    function updatePenStroke(points) {
      clearPenStroke();

      if (points.length < 2) return;

      const threePoints = points.map(p => new THREE.Vector3(p.x, 0.2, p.y));
      const geometry = new THREE.BufferGeometry().setFromPoints(threePoints);
      const material = new THREE.LineBasicMaterial({
        color: 0x00d4ff,
        linewidth: 2
      });

      tempPenStroke = new THREE.Line(geometry, material);
      scene.add(tempPenStroke);
    }

    function clearPenStroke() {
      if (tempPenStroke) {
        scene.remove(tempPenStroke);
        tempPenStroke = null;
      }
    }

    // Simplified lines with control points
    function updateSimplifiedPreview(points) {
      clearSimplifiedPreview();

      if (points.length < 2) return;

      // Draw wall segments between points
      for (let i = 0; i < points.length - 1; i++) {
        const start = points[i];
        const end = points[i + 1];
        const length = calculateDistance(start, end);

        if (length < 1) continue;

        const thickness = state.defaultWallThickness;
        const geometry = new THREE.PlaneGeometry(length, thickness);
        const material = new THREE.MeshBasicMaterial({
          color: 0x00d4ff,
          opacity: 0.7,
          transparent: true,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        const midX = (start.x + end.x) / 2;
        const midY = (start.y + end.y) / 2;
        const angle = Math.atan2(end.y - start.y, end.x - start.x);

        mesh.position.set(midX, 0.15, midY);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = -angle;

        scene.add(mesh);
        tempSimplifiedLines.push(mesh);
      }

      // Draw control points
      points.forEach((point, index) => {
        const isSelected = index === state.selectedPointIndex;
        const isHovered = index === state.hoveredPointIndex;

        const radius = isSelected || isHovered ? 6 : 4;
        const geometry = new THREE.CircleGeometry(radius, 16);
        const material = new THREE.MeshBasicMaterial({
          color: isSelected ? 0xff006e : (isHovered ? 0xffcc00 : 0x00d4ff),
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(point.x, 0.3, point.y);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { pointIndex: index };

        scene.add(mesh);
        tempControlPoints.push(mesh);

        // Draw outline
        const outlineGeometry = new THREE.RingGeometry(radius, radius + 1.5, 16);
        const outlineMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide
        });
        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outline.position.set(point.x, 0.29, point.y);
        outline.rotation.x = -Math.PI / 2;

        scene.add(outline);
        tempControlPoints.push(outline);
      });
    }

    function clearSimplifiedPreview() {
      tempSimplifiedLines.forEach(mesh => scene.remove(mesh));
      tempSimplifiedLines = [];

      tempControlPoints.forEach(mesh => scene.remove(mesh));
      tempControlPoints = [];
    }

    function findControlPointAtPosition(worldPos, points) {
      const threshold = 12;
      for (let i = 0; i < points.length; i++) {
        if (calculateDistance(worldPos, points[i]) < threshold) {
          return i;
        }
      }
      return -1;
    }

    // ============================================
    // WALL POINT EDITING (after placement)
    // ============================================

    let wallPointHandles = [];

    function showWallPointHandles(wall) {
      clearWallPointHandles();

      // Collect all points to show handles for
      const pointsToShow = [];

      // Add points from the selected wall
      if (wall) {
        pointsToShow.push({ wall, point: wall.start, type: 'start' });
        pointsToShow.push({ wall, point: wall.end, type: 'end' });
      }

      // Add points from multi-selection (avoid duplicates)
      for (const wp of state.selectedWallPoints) {
        const pos = wp.point === 'start' ? wp.wall.start : wp.wall.end;
        const exists = pointsToShow.some(p =>
          p.wall === wp.wall && p.type === wp.point
        );
        if (!exists) {
          pointsToShow.push({ wall: wp.wall, point: pos, type: wp.point });
        }
      }

      pointsToShow.forEach(({ wall: w, point, type }) => {
        const isSelected = state.selectedWallPoint &&
                          state.selectedWallPoint.wall === w &&
                          state.selectedWallPoint.point === type;
        const isMultiSelected = isWallPointSelected(w, type);
        const isHovered = state.hoveredWallPoint &&
                         state.hoveredWallPoint.wall === w &&
                         state.hoveredWallPoint.point === type;

        const radius = isSelected || isMultiSelected || isHovered ? 8 : 6;
        const geometry = new THREE.CircleGeometry(radius, 16);

        // Different colors: pink for single select, purple for multi-select, yellow for hover, cyan default
        let color = 0x00d4ff; // default cyan
        if (isMultiSelected) {
          color = 0x9945ff; // purple for multi-selection
        }
        if (isSelected) {
          color = 0xff006e; // pink for active drag point
        }
        if (isHovered && !isSelected && !isMultiSelected) {
          color = 0xffcc00; // yellow for hover
        }

        const material = new THREE.MeshBasicMaterial({
          color: color,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(point.x, 0.4, point.y);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { wallPoint: true, wall: w, pointType: type };

        scene.add(mesh);
        wallPointHandles.push(mesh);

        // Add outline
        const outlineGeometry = new THREE.RingGeometry(radius, radius + 2, 16);
        const outlineMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide
        });
        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outline.position.set(point.x, 0.39, point.y);
        outline.rotation.x = -Math.PI / 2;

        scene.add(outline);
        wallPointHandles.push(outline);
      });
    }

    function clearWallPointHandles() {
      wallPointHandles.forEach(mesh => scene.remove(mesh));
      wallPointHandles = [];
    }

    function findWallPointAtPosition(worldPos) {
      const threshold = 12;
      for (const wall of data.walls) {
        if (calculateDistance(worldPos, wall.start) < threshold) {
          return { wall, point: 'start' };
        }
        if (calculateDistance(worldPos, wall.end) < threshold) {
          return { wall, point: 'end' };
        }
      }
      return null;
    }

    function updateWallPointHandles() {
      if (state.selectedObject instanceof Wall || state.selectedWallPoints.length > 0) {
        showWallPointHandles(state.selectedObject instanceof Wall ? state.selectedObject : null);
      } else {
        clearWallPointHandles();
      }
    }

    // Find walls connected to a specific point
    function findWallsAtPoint(pos, excludeWall = null) {
      const threshold = 5;
      const connected = [];

      for (const wall of data.walls) {
        if (wall === excludeWall) continue;

        if (calculateDistance(pos, wall.start) < threshold) {
          connected.push({ wall, point: 'start' });
        } else if (calculateDistance(pos, wall.end) < threshold) {
          connected.push({ wall, point: 'end' });
        }
      }

      return connected;
    }

    // Check if a wall point is in the multi-selection
    function isWallPointSelected(wall, point) {
      return state.selectedWallPoints.some(
        wp => wp.wall === wall && wp.point === point
      );
    }

    // Add a wall point to multi-selection (if not already there)
    function addWallPointToSelection(wall, point) {
      if (!isWallPointSelected(wall, point)) {
        state.selectedWallPoints.push({ wall, point });
      }
    }

    // Remove a wall point from multi-selection
    function removeWallPointFromSelection(wall, point) {
      state.selectedWallPoints = state.selectedWallPoints.filter(
        wp => !(wp.wall === wall && wp.point === point)
      );
    }

    // Toggle a wall point in multi-selection
    function toggleWallPointSelection(wall, point) {
      if (isWallPointSelected(wall, point)) {
        removeWallPointFromSelection(wall, point);
      } else {
        addWallPointToSelection(wall, point);
      }
    }

    // Clear multi-selection
    function clearWallPointSelection() {
      state.selectedWallPoints = [];
    }

    // Select all wall points at a specific position (for selecting connected walls)
    function selectAllWallPointsAtPosition(pos) {
      const threshold = 10;
      for (const wall of data.walls) {
        if (calculateDistance(pos, wall.start) < threshold) {
          addWallPointToSelection(wall, 'start');
        }
        if (calculateDistance(pos, wall.end) < threshold) {
          addWallPointToSelection(wall, 'end');
        }
      }
    }

    // Get all unique positions of selected wall points
    function getSelectedWallPointPositions() {
      const positions = [];
      const threshold = 5;

      for (const wp of state.selectedWallPoints) {
        const pos = getWallPointPos(wp.wall, wp.point);
        // Check if this position is already in the list
        const exists = positions.some(p => calculateDistance(p, pos) < threshold);
        if (!exists) {
          positions.push({ x: pos.x, y: pos.y });
        }
      }
      return positions;
    }

    // Move all selected wall points by a delta
    function moveSelectedWallPoints(dx, dy) {
      // Group selected points by their position to move connected points together
      const positionGroups = new Map();
      const threshold = 5;

      for (const wp of state.selectedWallPoints) {
        const pos = getWallPointPos(wp.wall, wp.point);
        const key = `${Math.round(pos.x / threshold) * threshold},${Math.round(pos.y / threshold) * threshold}`;

        if (!positionGroups.has(key)) {
          positionGroups.set(key, []);
        }
        positionGroups.get(key).push(wp);
      }

      // Move each group of wall points
      for (const [key, wallPoints] of positionGroups) {
        for (const wp of wallPoints) {
          const currentPos = getWallPointPos(wp.wall, wp.point);
          setWallPointPos(wp.wall, wp.point, {
            x: currentPos.x + dx,
            y: currentPos.y + dy
          });
          wp.wall.create2DMesh();
        }
      }
    }

    // ============================================
    // MARQUEE SELECTION
    // ============================================

    function updateMarqueeVisual() {
      const marquee = document.getElementById('marquee-selection');
      if (!state.marqueeStart || !state.marqueeEnd) {
        marquee.style.display = 'none';
        return;
      }

      const rect = canvasContainer.getBoundingClientRect();
      const left = Math.min(state.marqueeStart.x, state.marqueeEnd.x) - rect.left;
      const top = Math.min(state.marqueeStart.y, state.marqueeEnd.y) - rect.top;
      const width = Math.abs(state.marqueeEnd.x - state.marqueeStart.x);
      const height = Math.abs(state.marqueeEnd.y - state.marqueeStart.y);

      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;
      marquee.style.display = 'block';
    }

    function hideMarquee() {
      const marquee = document.getElementById('marquee-selection');
      marquee.style.display = 'none';
    }

    function getMarqueeWorldBounds() {
      if (!state.marqueeStart || !state.marqueeEnd) return null;

      const start = screenToWorld(state.marqueeStart.x, state.marqueeStart.y);
      const end = screenToWorld(state.marqueeEnd.x, state.marqueeEnd.y);

      return {
        minX: Math.min(start.x, end.x),
        maxX: Math.max(start.x, end.x),
        minY: Math.min(start.y, end.y),
        maxY: Math.max(start.y, end.y)
      };
    }

    function isPointInBounds(point, bounds) {
      return point.x >= bounds.minX && point.x <= bounds.maxX &&
             point.y >= bounds.minY && point.y <= bounds.maxY;
    }

    function isWallInBounds(wall, bounds) {
      // Check if either endpoint is in bounds, or if wall crosses the bounds
      const startIn = isPointInBounds(wall.start, bounds);
      const endIn = isPointInBounds(wall.end, bounds);
      if (startIn || endIn) return true;

      // Check if wall line intersects the bounds rectangle
      return lineIntersectsRect(wall.start, wall.end, bounds);
    }

    function lineIntersectsRect(p1, p2, bounds) {
      // Check if line from p1 to p2 intersects the rectangle
      const left = bounds.minX, right = bounds.maxX;
      const top = bounds.minY, bottom = bounds.maxY;

      // Check intersection with each edge
      return lineIntersectsLine(p1, p2, {x: left, y: top}, {x: right, y: top}) ||
             lineIntersectsLine(p1, p2, {x: right, y: top}, {x: right, y: bottom}) ||
             lineIntersectsLine(p1, p2, {x: right, y: bottom}, {x: left, y: bottom}) ||
             lineIntersectsLine(p1, p2, {x: left, y: bottom}, {x: left, y: top});
    }

    function lineIntersectsLine(p1, p2, p3, p4) {
      const d1 = direction(p3, p4, p1);
      const d2 = direction(p3, p4, p2);
      const d3 = direction(p1, p2, p3);
      const d4 = direction(p1, p2, p4);

      if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
          ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
        return true;
      }
      return false;
    }

    function direction(p1, p2, p3) {
      return (p3.x - p1.x) * (p2.y - p1.y) - (p2.x - p1.x) * (p3.y - p1.y);
    }

    function isFurnitureInBounds(furniture, bounds) {
      // Check if furniture center is in bounds
      return isPointInBounds(furniture.position, bounds);
    }

    function isOpeningInBounds(opening, bounds) {
      // Get opening's world position
      const wall = opening.wall;
      const wallLength = wall.length;
      const openingPos = {
        x: wall.start.x + (wall.end.x - wall.start.x) * opening.position,
        y: wall.start.y + (wall.end.y - wall.start.y) * opening.position
      };
      return isPointInBounds(openingPos, bounds);
    }

    function updateMarqueePreviewSelection() {
      const bounds = getMarqueeWorldBounds();
      if (!bounds) return;

      // Clear and rebuild selection
      state.selectedWallPoints = [];

      // Select wall points within bounds
      for (const wall of data.walls) {
        if (isPointInBounds(wall.start, bounds)) {
          addWallPointToSelection(wall, 'start');
        }
        if (isPointInBounds(wall.end, bounds)) {
          addWallPointToSelection(wall, 'end');
        }
      }

      // Update visual feedback
      updateWallPointHandles();

      // Update status
      const count = state.selectedWallPoints.length;
      if (count > 0) {
        document.getElementById('status-mode').textContent = `Selecting ${count} points...`;
      } else {
        document.getElementById('status-mode').textContent = 'Select (drag to select multiple)';
      }
    }

    function completeMarqueeSelection() {
      const bounds = getMarqueeWorldBounds();
      hideMarquee();
      state.isMarqueeSelecting = false;
      state.marqueeStart = null;
      state.marqueeEnd = null;

      if (!bounds) return;

      // Final selection
      state.selectedWallPoints = [];

      // Select all wall points within bounds
      for (const wall of data.walls) {
        if (isPointInBounds(wall.start, bounds)) {
          addWallPointToSelection(wall, 'start');
        }
        if (isPointInBounds(wall.end, bounds)) {
          addWallPointToSelection(wall, 'end');
        }
      }

      // Update UI
      updateWallPointHandles();

      const count = state.selectedWallPoints.length;
      if (count > 0) {
        document.getElementById('status-mode').textContent = `${count} points selected (drag to move)`;
      } else {
        document.getElementById('status-mode').textContent = 'Select';
      }
    }

    // Get the position of a wall endpoint
    function getWallPointPos(wall, pointType) {
      return pointType === 'start' ? wall.start : wall.end;
    }

    // Set the position of a wall endpoint
    function setWallPointPos(wall, pointType, pos) {
      if (pointType === 'start') {
        wall.start.x = pos.x;
        wall.start.y = pos.y;
      } else {
        wall.end.x = pos.x;
        wall.end.y = pos.y;
      }
    }

    // Move a wall point and adjust connected walls to maintain rectangular shape
    function moveWallPointWithConstraints(wall, pointType, newPos, shiftKey) {
      const currentPos = getWallPointPos(wall, pointType);
      const connectedWalls = findWallsAtPoint(currentPos, wall);

      if (shiftKey || connectedWalls.length === 0) {
        // Free movement - just move the point
        setWallPointPos(wall, pointType, newPos);
        // Also move any walls connected at exactly this point
        connectedWalls.forEach(({ wall: connWall, point: connPoint }) => {
          setWallPointPos(connWall, connPoint, newPos);
          connWall.create2DMesh();
        });
      } else {
        // Constrained movement - maintain rectangular shape
        // Find the two walls connected at this corner
        const dx = newPos.x - currentPos.x;
        const dy = newPos.y - currentPos.y;

        // Move the main wall's point
        setWallPointPos(wall, pointType, newPos);

        // For each connected wall, we need to:
        // 1. Move the connected endpoint to match
        // 2. Adjust the wall to stay axis-aligned (if it was axis-aligned)
        connectedWalls.forEach(({ wall: connWall, point: connPoint }) => {
          const connCurrentPos = getWallPointPos(connWall, connPoint);
          const otherPoint = connPoint === 'start' ? 'end' : 'start';
          const otherPos = getWallPointPos(connWall, otherPoint);

          // Check if the connected wall is horizontal or vertical
          const isHorizontal = Math.abs(connCurrentPos.y - otherPos.y) < 5;
          const isVertical = Math.abs(connCurrentPos.x - otherPos.x) < 5;

          if (isHorizontal) {
            // Wall is horizontal - only move X, keep Y aligned with the other end
            setWallPointPos(connWall, connPoint, { x: newPos.x, y: otherPos.y });
            // But our main wall needs to connect, so update the main wall point Y
            if (pointType === 'start') {
              wall.start.y = otherPos.y;
            } else {
              wall.end.y = otherPos.y;
            }
          } else if (isVertical) {
            // Wall is vertical - only move Y, keep X aligned with the other end
            setWallPointPos(connWall, connPoint, { x: otherPos.x, y: newPos.y });
            // But our main wall needs to connect, so update the main wall point X
            if (pointType === 'start') {
              wall.start.x = otherPos.x;
            } else {
              wall.end.x = otherPos.x;
            }
          } else {
            // Wall is diagonal - just move the point freely
            setWallPointPos(connWall, connPoint, newPos);
          }

          connWall.create2DMesh();
        });

        // Now we need to find walls connected at the OTHER ends of the connected walls
        // and adjust them too to complete the rectangle
        connectedWalls.forEach(({ wall: connWall, point: connPoint }) => {
          const otherPoint = connPoint === 'start' ? 'end' : 'start';
          const otherPos = getWallPointPos(connWall, otherPoint);

          // Find walls connected at the other end
          const furtherWalls = findWallsAtPoint(otherPos, connWall);
          furtherWalls.forEach(({ wall: furtherWall, point: furtherPoint }) => {
            if (furtherWall === wall) return; // Skip the original wall

            const furtherOtherPoint = furtherPoint === 'start' ? 'end' : 'start';
            const furtherOtherPos = getWallPointPos(furtherWall, furtherOtherPoint);

            // Check orientation
            const isHorizontal = Math.abs(otherPos.y - furtherOtherPos.y) < 5;
            const isVertical = Math.abs(otherPos.x - furtherOtherPos.x) < 5;

            if (isHorizontal) {
              // Keep Y, update X
              setWallPointPos(furtherWall, furtherPoint, { x: otherPos.x, y: furtherOtherPos.y });
            } else if (isVertical) {
              // Keep X, update Y
              setWallPointPos(furtherWall, furtherPoint, { x: furtherOtherPos.x, y: otherPos.y });
            }

            furtherWall.create2DMesh();
          });
        });
      }

      wall.create2DMesh();
    }

    // ============================================
    // FURNITURE HANDLES & EDGE MEASUREMENTS
    // ============================================

    let furnitureHandles = [];
    let furnitureEdgeLabels = [];

    function getFurnitureCorners(furniture) {
      // Get the 4 corners of the furniture considering rotation
      const cx = furniture.position.x;
      const cy = furniture.position.y;
      const hw = furniture.width / 2;
      const hd = furniture.depth / 2;
      const rot = furniture.rotation;
      const cos = Math.cos(rot);
      const sin = Math.sin(rot);

      // Local corners before rotation
      const localCorners = [
        { x: -hw, y: -hd, name: 'topLeft' },
        { x: hw, y: -hd, name: 'topRight' },
        { x: hw, y: hd, name: 'bottomRight' },
        { x: -hw, y: hd, name: 'bottomLeft' }
      ];

      // Transform to world coordinates
      return localCorners.map(corner => ({
        x: cx + corner.x * cos - corner.y * sin,
        y: cy + corner.x * sin + corner.y * cos,
        name: corner.name
      }));
    }

    function showFurnitureHandles(furniture) {
      clearFurnitureHandles();

      if (!furniture || furniture.isCircular()) {
        // For round furniture, show center and radius handle
        showCircularFurnitureHandles(furniture);
        return;
      }

      const corners = getFurnitureCorners(furniture);

      // Create corner handles
      corners.forEach((corner, index) => {
        const isHovered = state.hoveredFurnitureHandle &&
                         state.hoveredFurnitureHandle.furniture === furniture &&
                         state.hoveredFurnitureHandle.corner === corner.name;

        const radius = isHovered ? 7 : 5;
        const geometry = new THREE.CircleGeometry(radius, 16);
        const material = new THREE.MeshBasicMaterial({
          color: isHovered ? 0xffcc00 : 0x95d5b2,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(corner.x, 0.5, corner.y);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { furnitureHandle: true, furniture, corner: corner.name, cornerIndex: index };

        scene.add(mesh);
        furnitureHandles.push(mesh);

        // Add outline
        const outlineGeometry = new THREE.RingGeometry(radius, radius + 1.5, 16);
        const outlineMaterial = new THREE.MeshBasicMaterial({
          color: 0x000000,
          side: THREE.DoubleSide
        });
        const outline = new THREE.Mesh(outlineGeometry, outlineMaterial);
        outline.position.set(corner.x, 0.49, corner.y);
        outline.rotation.x = -Math.PI / 2;
        scene.add(outline);
        furnitureHandles.push(outline);
      });

      // Create edge handles (midpoints) for resizing individual edges
      for (let i = 0; i < corners.length; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % corners.length];
        const midX = (c1.x + c2.x) / 2;
        const midY = (c1.y + c2.y) / 2;

        const edgeName = ['top', 'right', 'bottom', 'left'][i];
        const isHovered = state.hoveredFurnitureHandle &&
                         state.hoveredFurnitureHandle.furniture === furniture &&
                         state.hoveredFurnitureHandle.edge === edgeName;

        const geometry = new THREE.BoxGeometry(6, 6, 1);
        const material = new THREE.MeshBasicMaterial({
          color: isHovered ? 0xffcc00 : 0x00d4ff,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(midX, 0.5, midY);
        mesh.rotation.x = -Math.PI / 2;
        mesh.rotation.z = furniture.rotation;
        mesh.userData = { furnitureHandle: true, furniture, edge: edgeName, edgeIndex: i };

        scene.add(mesh);
        furnitureHandles.push(mesh);
      }

      // Create perimeter outline
      const outlinePoints = corners.map(c => new THREE.Vector3(c.x, 0.45, c.y));
      outlinePoints.push(outlinePoints[0].clone()); // Close the loop
      const outlineGeometry = new THREE.BufferGeometry().setFromPoints(outlinePoints);
      const outlineMaterial = new THREE.LineBasicMaterial({ color: 0x95d5b2, linewidth: 2 });
      const outlineLine = new THREE.Line(outlineGeometry, outlineMaterial);
      scene.add(outlineLine);
      furnitureHandles.push(outlineLine);

      // Create edge dimension labels
      showFurnitureEdgeLabels(furniture, corners);
    }

    function showCircularFurnitureHandles(furniture) {
      if (!furniture) return;

      const cx = furniture.position.x;
      const cy = furniture.position.y;
      const radius = furniture.width / 2;

      // Center handle
      const centerGeometry = new THREE.CircleGeometry(5, 16);
      const centerMaterial = new THREE.MeshBasicMaterial({
        color: 0x95d5b2,
        side: THREE.DoubleSide
      });
      const centerMesh = new THREE.Mesh(centerGeometry, centerMaterial);
      centerMesh.position.set(cx, 0.5, cy);
      centerMesh.rotation.x = -Math.PI / 2;
      scene.add(centerMesh);
      furnitureHandles.push(centerMesh);

      // Radius handles at 4 cardinal points
      const cardinalPoints = [
        { x: cx + radius, y: cy, name: 'right' },
        { x: cx - radius, y: cy, name: 'left' },
        { x: cx, y: cy + radius, name: 'bottom' },
        { x: cx, y: cy - radius, name: 'top' }
      ];

      cardinalPoints.forEach(point => {
        const isHovered = state.hoveredFurnitureHandle &&
                         state.hoveredFurnitureHandle.furniture === furniture &&
                         state.hoveredFurnitureHandle.radiusHandle === point.name;

        const handleRadius = isHovered ? 6 : 4;
        const geometry = new THREE.CircleGeometry(handleRadius, 16);
        const material = new THREE.MeshBasicMaterial({
          color: isHovered ? 0xffcc00 : 0x00d4ff,
          side: THREE.DoubleSide
        });

        const mesh = new THREE.Mesh(geometry, material);
        mesh.position.set(point.x, 0.5, point.y);
        mesh.rotation.x = -Math.PI / 2;
        mesh.userData = { furnitureHandle: true, furniture, radiusHandle: point.name };

        scene.add(mesh);
        furnitureHandles.push(mesh);
      });

      // Circle outline
      const circlePoints = [];
      for (let i = 0; i <= 64; i++) {
        const angle = (i / 64) * Math.PI * 2;
        circlePoints.push(new THREE.Vector3(
          cx + radius * Math.cos(angle),
          0.45,
          cy + radius * Math.sin(angle)
        ));
      }
      const circleGeometry = new THREE.BufferGeometry().setFromPoints(circlePoints);
      const circleMaterial = new THREE.LineBasicMaterial({ color: 0x95d5b2 });
      const circleLine = new THREE.Line(circleGeometry, circleMaterial);
      scene.add(circleLine);
      furnitureHandles.push(circleLine);

      // Diameter label
      const diamLabel = document.createElement('div');
      diamLabel.className = 'dimension-label furniture-dim';
      diamLabel.textContent = 'Ø ' + formatMeasurement(furniture.width);
      diamLabel.style.pointerEvents = 'none';
      labelsContainer.appendChild(diamLabel);
      furnitureEdgeLabels.push(diamLabel);

      // Position label
      const screenPos = worldToScreen(cx, cy - radius - 10);
      diamLabel.style.left = `${screenPos.x}px`;
      diamLabel.style.top = `${screenPos.y}px`;
      diamLabel.style.transform = 'translate(-50%, -50%)';
    }

    function showFurnitureEdgeLabels(furniture, corners) {
      clearFurnitureEdgeLabels();

      // Edge names for width/depth identification
      const edgeNames = ['top', 'right', 'bottom', 'left'];
      const edgeDimensions = ['depth', 'width', 'depth', 'width']; // Which dimension each edge represents

      // Create a label for each edge
      for (let i = 0; i < corners.length; i++) {
        const c1 = corners[i];
        const c2 = corners[(i + 1) % corners.length];

        // Calculate edge length
        const length = calculateDistance(c1, c2);

        // Calculate midpoint
        const midX = (c1.x + c2.x) / 2;
        const midY = (c1.y + c2.y) / 2;

        // Calculate offset perpendicular to edge (to place label outside perimeter)
        const edgeAngle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
        const offsetDist = 18; // Increased offset to be clearly outside
        const offsetX = -Math.sin(edgeAngle) * offsetDist;
        const offsetY = Math.cos(edgeAngle) * offsetDist;

        // Create label - styled like wall dimension labels
        const label = document.createElement('div');
        label.className = 'wall-dimension-label furniture-dim';
        label.textContent = formatMeasurement(length);
        label.style.pointerEvents = 'auto';
        label.style.cursor = 'pointer';
        label.style.background = 'rgba(0, 0, 0, 0.8)';
        label.style.color = '#00d4ff';
        label.style.borderColor = '#00d4ff';

        // Store data for click handling
        const dimType = edgeDimensions[i];
        label.dataset.furnitureId = furniture.id;
        label.dataset.dimension = dimType;
        label.dataset.edgeIndex = i;

        // Click handler for editing
        label.addEventListener('click', (e) => {
          e.stopPropagation();
          const currentValue = dimType === 'width' ? furniture.width : furniture.depth;
          const newValue = prompt(`Enter new ${dimType} (inches):`, Math.round(currentValue));
          if (newValue !== null && !isNaN(parseFloat(newValue))) {
            const val = Math.max(1, parseFloat(newValue));
            if (dimType === 'width') {
              furniture.width = val;
            } else {
              furniture.depth = val;
            }
            furniture.create2DMesh();
            furniture.create3DMesh();
            showFurnitureHandles(furniture);
            // Update properties panel if visible
            if (document.getElementById('furniture-properties').style.display !== 'none') {
              document.getElementById('furn-width').value = Math.round(furniture.width);
              document.getElementById('furn-depth').value = Math.round(furniture.depth);
            }
            saveHistory();
          }
        });

        labelsContainer.appendChild(label);
        furnitureEdgeLabels.push(label);

        // Position label
        const screenPos = worldToScreen(midX + offsetX, midY + offsetY);
        label.style.left = `${screenPos.x}px`;
        label.style.top = `${screenPos.y}px`;
        label.style.transform = 'translate(-50%, -50%)';
      }
    }

    function clearFurnitureHandles() {
      furnitureHandles.forEach(mesh => scene.remove(mesh));
      furnitureHandles = [];
      clearFurnitureEdgeLabels();
    }

    function clearFurnitureEdgeLabels() {
      furnitureEdgeLabels.forEach(label => label.remove());
      furnitureEdgeLabels = [];
    }

    function findFurnitureHandleAtPosition(worldPos) {
      const threshold = 10;

      for (const furniture of data.furniture) {
        if (!furniture.selected) continue;

        if (furniture.isCircular()) {
          // Check radius handles for circular furniture
          const cx = furniture.position.x;
          const cy = furniture.position.y;
          const radius = furniture.width / 2;

          const cardinalPoints = [
            { x: cx + radius, y: cy, name: 'right' },
            { x: cx - radius, y: cy, name: 'left' },
            { x: cx, y: cy + radius, name: 'bottom' },
            { x: cx, y: cy - radius, name: 'top' }
          ];

          for (const point of cardinalPoints) {
            if (calculateDistance(worldPos, point) < threshold) {
              return { furniture, radiusHandle: point.name };
            }
          }
        } else {
          // Check corner handles
          const corners = getFurnitureCorners(furniture);
          for (const corner of corners) {
            if (calculateDistance(worldPos, corner) < threshold) {
              return { furniture, corner: corner.name };
            }
          }

          // Check edge handles
          for (let i = 0; i < corners.length; i++) {
            const c1 = corners[i];
            const c2 = corners[(i + 1) % corners.length];
            const midX = (c1.x + c2.x) / 2;
            const midY = (c1.y + c2.y) / 2;

            if (calculateDistance(worldPos, { x: midX, y: midY }) < threshold) {
              const edgeName = ['top', 'right', 'bottom', 'left'][i];
              return { furniture, edge: edgeName, edgeIndex: i };
            }
          }
        }
      }
      return null;
    }

    function updateFurnitureHandles() {
      if (state.selectedObject instanceof Furniture) {
        showFurnitureHandles(state.selectedObject);
      } else {
        clearFurnitureHandles();
      }
    }

    function updateFurnitureEdgeLabelPositions() {
      if (!(state.selectedObject instanceof Furniture) || furnitureEdgeLabels.length === 0) return;

      const furniture = state.selectedObject;

      if (furniture.isCircular()) {
        // Update circular furniture label
        if (furnitureEdgeLabels.length > 0) {
          const cx = furniture.position.x;
          const cy = furniture.position.y;
          const radius = furniture.width / 2;
          furnitureEdgeLabels[0].textContent = 'Ø ' + formatMeasurement(furniture.width);
          const screenPos = worldToScreen(cx, cy - radius - 10);
          furnitureEdgeLabels[0].style.left = `${screenPos.x}px`;
          furnitureEdgeLabels[0].style.top = `${screenPos.y}px`;
        }
      } else {
        const corners = getFurnitureCorners(furniture);
        for (let i = 0; i < corners.length && i < furnitureEdgeLabels.length; i++) {
          const c1 = corners[i];
          const c2 = corners[(i + 1) % corners.length];

          const length = calculateDistance(c1, c2);
          const midX = (c1.x + c2.x) / 2;
          const midY = (c1.y + c2.y) / 2;

          const edgeAngle = Math.atan2(c2.y - c1.y, c2.x - c1.x);
          const offsetDist = 18; // Match showFurnitureEdgeLabels offset
          const offsetX = -Math.sin(edgeAngle) * offsetDist;
          const offsetY = Math.cos(edgeAngle) * offsetDist;

          furnitureEdgeLabels[i].textContent = formatMeasurement(length);
          const screenPos = worldToScreen(midX + offsetX, midY + offsetY);
          furnitureEdgeLabels[i].style.left = `${screenPos.x}px`;
          furnitureEdgeLabels[i].style.top = `${screenPos.y}px`;
        }
      }
    }

    function mergeWallPoints(draggedPoint, targetPoint) {
      const { wall: draggedWall, point: draggedEnd } = draggedPoint;
      const { wall: targetWall, point: targetEnd, pos: targetPos } = targetPoint;

      // Set the dragged point to exactly match the target position
      if (draggedEnd === 'start') {
        draggedWall.start.x = targetPos.x;
        draggedWall.start.y = targetPos.y;
      } else {
        draggedWall.end.x = targetPos.x;
        draggedWall.end.y = targetPos.y;
      }

      // Rebuild meshes
      draggedWall.create2DMesh();
      targetWall.create2DMesh();
      updateWallPointHandles();
    }

    // Edit wall length via dimension label click
    function editWallLength(wall) {
      const currentLength = wall.length;
      const mid = wall.midpoint;
      const screenPos = worldToScreen(mid.x, mid.y);
      const rect = canvasContainer.getBoundingClientRect();

      // Create input element
      const input = document.createElement('input');
      input.type = 'text';
      input.className = 'dimension-input';
      input.value = formatMeasurement(currentLength);
      input.style.left = `${screenPos.x - rect.left}px`;
      input.style.top = `${screenPos.y - rect.top}px`;

      labelsContainer.appendChild(input);
      input.focus();
      input.select();

      function applyChange() {
        const newValue = parseMeasurement(input.value);
        if (newValue && newValue > 0 && newValue !== currentLength) {
          // Calculate new end point maintaining wall direction
          const angle = wall.angle;
          wall.end.x = wall.start.x + Math.cos(angle) * newValue;
          wall.end.y = wall.start.y + Math.sin(angle) * newValue;

          wall.create2DMesh();
          updateWallPointHandles();
          saveHistory();
        }
        input.remove();
      }

      input.addEventListener('blur', applyChange);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          applyChange();
        } else if (e.key === 'Escape') {
          input.remove();
        }
      });
    }

    // Parse measurement string to inches (e.g., "6'-4\"" -> 76)
    function parseMeasurement(str) {
      str = str.trim();

      // Try feet and inches format: 6'-4" or 6' 4" or 6'4"
      const ftInMatch = str.match(/(\d+(?:\.\d+)?)\s*['']\s*-?\s*(\d+(?:\.\d+)?)\s*["""]?/);
      if (ftInMatch) {
        return parseFloat(ftInMatch[1]) * 12 + parseFloat(ftInMatch[2]);
      }

      // Try feet only format: 6' or 6ft
      const ftMatch = str.match(/(\d+(?:\.\d+)?)\s*[''f]/i);
      if (ftMatch) {
        return parseFloat(ftMatch[1]) * 12;
      }

      // Try inches only: 72" or 72in or just 72
      const inMatch = str.match(/(\d+(?:\.\d+)?)\s*[""i]?/i);
      if (inMatch) {
        return parseFloat(inMatch[1]);
      }

      return null;
    }

    function deleteWallPoint(wallPoint) {
      const { wall, point } = wallPoint;
      const pointToDelete = point === 'start' ? wall.start : wall.end;
      const otherPoint = point === 'start' ? wall.end : wall.start;
      const threshold = 10;

      // Find walls connected to this point
      const connectedWalls = data.walls.filter(w => {
        if (w === wall) return false;
        return calculateDistance(w.start, pointToDelete) < threshold ||
               calculateDistance(w.end, pointToDelete) < threshold;
      });

      if (connectedWalls.length === 1) {
        // Merge the two walls
        const otherWall = connectedWalls[0];

        // Determine which end of the other wall connects to the deleted point
        const otherConnectsAtStart = calculateDistance(otherWall.start, pointToDelete) < threshold;

        // The new merged wall goes from otherPoint of current wall to the far end of other wall
        const newStart = { ...otherPoint };
        const newEnd = otherConnectsAtStart ? { ...otherWall.end } : { ...otherWall.start };

        // Remove both walls
        wall.remove();
        otherWall.remove();
        data.walls = data.walls.filter(w => w !== wall && w !== otherWall);

        // Create new merged wall
        const newWall = new Wall(newStart, newEnd, state.defaultWallThickness, state.defaultWallHeight);
        data.walls.push(newWall);
        newWall.create2DMesh();

        selectObject(newWall);
        saveHistory();
      } else if (connectedWalls.length === 0) {
        // No connected walls, just delete this wall
        wall.remove();
        data.walls = data.walls.filter(w => w !== wall);
        selectObject(null);
        saveHistory();
      } else {
        // Multiple walls connected - just delete this wall segment
        wall.remove();
        data.walls = data.walls.filter(w => w !== wall);
        selectObject(null);
        saveHistory();
      }

      state.selectedWallPoint = null;
      clearWallPointHandles();
      updateStats();
    }

    function updateTempDimensionLabel(start, end) {
      if (!tempDimensionLabel) {
        tempDimensionLabel = document.createElement('div');
        tempDimensionLabel.className = 'dimension-label';
        labelsContainer.appendChild(tempDimensionLabel);
      }

      const length = calculateDistance(start, end);
      const midpoint = {
        x: (start.x + end.x) / 2,
        y: (start.y + end.y) / 2
      };

      tempDimensionLabel.textContent = formatMeasurement(length);

      const screenPos = worldToScreen(midpoint.x, midpoint.y);
      const rect = canvasContainer.getBoundingClientRect();
      tempDimensionLabel.style.left = `${screenPos.x - rect.left}px`;
      tempDimensionLabel.style.top = `${screenPos.y - rect.top - 20}px`;
      tempDimensionLabel.style.display = 'block';

      // Update status bar
      document.getElementById('status-length').textContent = formatMeasurement(length);
    }

    function hideTempDimensionLabel() {
      if (tempDimensionLabel) {
        tempDimensionLabel.style.display = 'none';
      }
      document.getElementById('status-length').textContent = '-';
    }

    // ============================================
    // RENDERING
    // ============================================

    function renderAll() {
      // Clear all meshes
      data.walls.forEach(wall => wall.remove());
      data.openings.forEach(opening => opening.remove());
      data.furniture.forEach(furniture => furniture.remove());
      data.dimensions.forEach(dim => dim.remove());
      data.annotations.forEach(ann => ann.remove());
      data.wires.forEach(wire => wire.remove());

      // Render based on view and layer visibility
      if (state.currentView === '2d') {
        // Remove continuous wall mesh if it exists
        if (continuousWallMesh) {
          scene.remove(continuousWallMesh);
          continuousWallMesh = null;
        }

        if (state.layers.walls) {
          data.walls.forEach(wall => wall.create2DMesh());
        }
        if (state.layers.openings) {
          data.openings.forEach(opening => opening.create2DMesh());
        }
        if (state.layers.furniture) {
          data.furniture.forEach(furniture => furniture.create2DMesh());
        }
      } else {
        // 3D view - use continuous wall mesh
        if (state.layers.walls) {
          buildContinuousWallMesh();
        } else if (continuousWallMesh) {
          scene.remove(continuousWallMesh);
          continuousWallMesh = null;
        }

        if (state.layers.furniture) {
          data.furniture.forEach(furniture => furniture.create3DMesh());
        }
      }

      if (state.layers.dimensions) {
        data.dimensions.forEach(dim => dim.createMesh());
      }

      if (state.layers.annotations) {
        data.annotations.forEach(ann => ann.createMesh());
      }

      // Render wires in both views
      data.wires.forEach(wire => {
        if (state.currentView === '2d') {
          wire.create2DMesh();
        } else {
          wire.create3DMesh();
        }
      });

      updateStats();
    }

    function updateLabelPositions() {
      // Show wall dimension labels in both 2D and 3D views
      data.walls.forEach(wall => {
        if (wall.dimensionLabel) {
          wall.dimensionLabel.style.display = 'block';
          wall.updateDimensionLabel();
          // In 3D, position labels higher and add slight transparency
          if (state.currentView === '3d') {
            wall.dimensionLabel.style.opacity = '0.9';
          } else {
            wall.dimensionLabel.style.opacity = '1';
          }
        }
      });
      data.dimensions.forEach(dim => dim.updateLabelPosition());
      data.annotations.forEach(ann => ann.updateLabelPosition());
      updateFurnitureEdgeLabelPositions();
    }

    function updateStats() {
      document.getElementById('stat-walls').textContent = data.walls.length;
      document.getElementById('stat-openings').textContent = data.openings.length;
      document.getElementById('stat-furniture').textContent = data.furniture.length;
    }

    // ============================================
    // CONTINUOUS WALL MESH WITH MITER JOINTS
    // ============================================

    let continuousWallMesh = null;

    function buildContinuousWallMesh() {
      // Remove existing continuous wall mesh
      if (continuousWallMesh) {
        scene.remove(continuousWallMesh);
        continuousWallMesh = null;
      }

      if (data.walls.length === 0) return;

      // Find connected wall chains
      const chains = findWallChains();
      const group = new THREE.Group();

      chains.forEach(chain => {
        const wallMesh = createChainMesh(chain);
        if (wallMesh) {
          group.add(wallMesh);
        }
      });

      // Add opening cutouts (rendered separately for visibility)
      data.openings.forEach(opening => {
        const openingMesh = createOpening3DMesh(opening);
        if (openingMesh) {
          group.add(openingMesh);
        }
      });

      continuousWallMesh = group;
      scene.add(continuousWallMesh);
    }

    function findWallChains() {
      // Build adjacency graph
      const wallsCopy = [...data.walls];
      const chains = [];
      const used = new Set();
      const threshold = 5; // Snap threshold for connecting walls

      function pointsMatch(p1, p2) {
        return calculateDistance(p1, p2) < threshold;
      }

      function findConnectedWall(point, excludeWall) {
        for (const wall of wallsCopy) {
          if (wall === excludeWall || used.has(wall.id)) continue;
          if (pointsMatch(point, wall.start)) {
            return { wall, startPoint: 'start', endPoint: 'end' };
          }
          if (pointsMatch(point, wall.end)) {
            return { wall, startPoint: 'end', endPoint: 'start' };
          }
        }
        return null;
      }

      // Build chains
      for (const startWall of wallsCopy) {
        if (used.has(startWall.id)) continue;

        const chain = [];
        used.add(startWall.id);

        // Add first wall
        chain.push({
          wall: startWall,
          start: { ...startWall.start },
          end: { ...startWall.end }
        });

        // Extend forward from end
        let currentEnd = startWall.end;
        let lastWall = startWall;
        while (true) {
          const next = findConnectedWall(currentEnd, lastWall);
          if (!next) break;
          used.add(next.wall.id);

          const segStart = next.wall[next.startPoint];
          const segEnd = next.wall[next.endPoint];
          chain.push({
            wall: next.wall,
            start: { ...segStart },
            end: { ...segEnd }
          });
          currentEnd = segEnd;
          lastWall = next.wall;
        }

        // Extend backward from start
        let currentStart = startWall.start;
        lastWall = startWall;
        const frontSegments = [];
        while (true) {
          const prev = findConnectedWall(currentStart, lastWall);
          if (!prev) break;
          used.add(prev.wall.id);

          const segStart = prev.wall[prev.endPoint]; // Reversed
          const segEnd = prev.wall[prev.startPoint];
          frontSegments.unshift({
            wall: prev.wall,
            start: { ...segStart },
            end: { ...segEnd }
          });
          currentStart = segStart;
          lastWall = prev.wall;
        }

        // Combine
        chains.push([...frontSegments, ...chain]);
      }

      return chains;
    }

    function createChainMesh(chain) {
      if (chain.length === 0) return null;

      const thickness = state.defaultWallThickness;
      const height = state.defaultWallHeight;
      const halfThick = thickness / 2;

      // Generate the thick path with miter joints
      const outerPoints = [];
      const innerPoints = [];

      for (let i = 0; i < chain.length; i++) {
        const seg = chain[i];
        const prevSeg = i > 0 ? chain[i - 1] : null;
        const nextSeg = i < chain.length - 1 ? chain[i + 1] : null;

        // Direction of current segment
        const dx = seg.end.x - seg.start.x;
        const dy = seg.end.y - seg.start.y;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 0.1) continue;

        const dirX = dx / len;
        const dirY = dy / len;

        // Perpendicular (to the left)
        const perpX = -dirY;
        const perpY = dirX;

        if (i === 0) {
          // First segment start - flat cap
          outerPoints.push({
            x: seg.start.x + perpX * halfThick,
            y: seg.start.y + perpY * halfThick
          });
          innerPoints.push({
            x: seg.start.x - perpX * halfThick,
            y: seg.start.y - perpY * halfThick
          });
        }

        if (nextSeg) {
          // Miter joint at seg.end / nextSeg.start
          const miter = calculateMiterPoint(seg, nextSeg, halfThick, true);

          // Use arc points for smooth corners if available
          if (miter.outerArc && miter.outerArc.length > 0) {
            miter.outerArc.forEach(p => outerPoints.push(p));
          } else {
            outerPoints.push(miter.outer);
          }

          if (miter.innerArc && miter.innerArc.length > 0) {
            miter.innerArc.forEach(p => innerPoints.push(p));
          } else {
            innerPoints.push(miter.inner);
          }
        } else {
          // Last segment end - flat cap
          outerPoints.push({
            x: seg.end.x + perpX * halfThick,
            y: seg.end.y + perpY * halfThick
          });
          innerPoints.push({
            x: seg.end.x - perpX * halfThick,
            y: seg.end.y - perpY * halfThick
          });
        }
      }

      // Check if chain is closed (loop)
      const firstSeg = chain[0];
      const lastSeg = chain[chain.length - 1];
      const isClosed = calculateDistance(firstSeg.start, lastSeg.end) < 5;

      if (isClosed && chain.length > 1) {
        // Calculate miter at the closing joint
        const miter = calculateMiterPoint(lastSeg, firstSeg, halfThick);
        outerPoints[outerPoints.length - 1] = miter.outer;
        innerPoints[innerPoints.length - 1] = miter.inner;
        outerPoints[0] = miter.outer;
        innerPoints[0] = miter.inner;
      }

      // Create the shape
      // Note: We negate Y to fix the coordinate system mapping between
      // world coords (Y positive = down/south) and Three.js (Z positive = toward viewer)
      const shape = new THREE.Shape();

      // Outer path
      shape.moveTo(outerPoints[0].x, -outerPoints[0].y);
      for (let i = 1; i < outerPoints.length; i++) {
        shape.lineTo(outerPoints[i].x, -outerPoints[i].y);
      }

      // Connect to inner path (reverse order)
      for (let i = innerPoints.length - 1; i >= 0; i--) {
        shape.lineTo(innerPoints[i].x, -innerPoints[i].y);
      }

      shape.lineTo(outerPoints[0].x, -outerPoints[0].y);

      // Note: We no longer punch holes in the wall shape for openings.
      // The opening 3D meshes (doors, windows) are rendered separately with proper
      // sill and header sections. Punching 2D holes in the shape and extruding
      // creates full-height gaps which cause texture artifacts on wall top/bottom faces.
      // The opening meshes visually cover the wall areas where doors/windows are placed.

      // Extrude
      const extrudeSettings = {
        depth: height,
        bevelEnabled: false
      };

      const geometry = new THREE.ExtrudeGeometry(shape, extrudeSettings);

      // Rotate so Y is up
      geometry.rotateX(-Math.PI / 2);

      const material = new THREE.MeshStandardMaterial({
        color: 0x00a8cc,
        side: THREE.DoubleSide,
        roughness: 0.6,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
        depthWrite: true
      });

      const mesh = new THREE.Mesh(geometry, material);
      mesh.renderOrder = 1; // Render walls after other objects

      // Add edges (keep edges fully opaque for clarity)
      const edgesGeometry = new THREE.EdgesGeometry(geometry, 15);
      const edgesMaterial = new THREE.LineBasicMaterial({ color: 0x00d4ff });
      const edges = new THREE.LineSegments(edgesGeometry, edgesMaterial);
      edges.renderOrder = 2; // Edges on top
      mesh.add(edges);

      return mesh;
    }

    function calculateMiterPoint(seg1, seg2, halfThick, smooth = true) {
      // Direction vectors
      const d1x = seg1.end.x - seg1.start.x;
      const d1y = seg1.end.y - seg1.start.y;
      const len1 = Math.sqrt(d1x * d1x + d1y * d1y);
      const dir1x = d1x / len1;
      const dir1y = d1y / len1;

      const d2x = seg2.end.x - seg2.start.x;
      const d2y = seg2.end.y - seg2.start.y;
      const len2 = Math.sqrt(d2x * d2x + d2y * d2y);
      const dir2x = d2x / len2;
      const dir2y = d2y / len2;

      // Perpendiculars (to the left)
      const perp1x = -dir1y;
      const perp1y = dir1x;
      const perp2x = -dir2y;
      const perp2y = dir2x;

      // Average perpendicular for miter
      let miterX = perp1x + perp2x;
      let miterY = perp1y + perp2y;
      const miterLen = Math.sqrt(miterX * miterX + miterY * miterY);

      if (miterLen < 0.01) {
        // Segments are parallel (180 degree turn), use perpendicular
        miterX = perp1x;
        miterY = perp1y;
      } else {
        miterX /= miterLen;
        miterY /= miterLen;
      }

      // Miter length factor
      const dot = perp1x * miterX + perp1y * miterY;
      const miterScale = dot > 0.1 ? halfThick / dot : halfThick;

      // Limit miter length to prevent very long spikes
      const maxMiter = halfThick * 2;
      const actualMiter = Math.min(miterScale, maxMiter);

      const jointPoint = seg1.end; // or seg2.start, they should be the same

      return {
        outer: {
          x: jointPoint.x + miterX * actualMiter,
          y: jointPoint.y + miterY * actualMiter
        },
        inner: {
          x: jointPoint.x - miterX * actualMiter,
          y: jointPoint.y - miterY * actualMiter
        },
        // For smooth corners, provide arc points
        outerArc: smooth ? generateCornerArc(jointPoint, seg1, seg2, halfThick, true) : null,
        innerArc: smooth ? generateCornerArc(jointPoint, seg1, seg2, halfThick, false) : null
      };
    }

    function generateCornerArc(center, seg1, seg2, halfThick, isOuter) {
      // Calculate angles
      const angle1 = Math.atan2(-(seg1.end.y - seg1.start.y), -(seg1.end.x - seg1.start.x));
      const angle2 = Math.atan2(seg2.end.y - seg2.start.y, seg2.end.x - seg2.start.x);

      // Perpendicular angles
      const perpAngle1 = angle1 + (isOuter ? Math.PI / 2 : -Math.PI / 2);
      const perpAngle2 = angle2 + (isOuter ? -Math.PI / 2 : Math.PI / 2);

      // Determine if we need an arc (convex corner on this side)
      let angleDiff = perpAngle2 - perpAngle1;
      while (angleDiff > Math.PI) angleDiff -= 2 * Math.PI;
      while (angleDiff < -Math.PI) angleDiff += 2 * Math.PI;

      // Only create arc if the angle difference warrants it
      if (Math.abs(angleDiff) < 0.1) return null;

      const arcPoints = [];
      const radius = halfThick;
      const steps = Math.max(3, Math.ceil(Math.abs(angleDiff) / (Math.PI / 8)));

      for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        const angle = perpAngle1 + angleDiff * t;
        arcPoints.push({
          x: center.x + Math.cos(angle) * radius,
          y: center.y + Math.sin(angle) * radius
        });
      }

      return arcPoints;
    }

    function createOpening3DMesh(opening) {
      const wall = opening.wall;
      const pos = opening.worldPosition;
      const angle = wall.angle;

      const openingHeight = opening.height;
      const width = opening.width;
      const depth = wall.thickness + 2; // Match wall thickness with slight overlap
      const sillHeight = opening.sillHeight || 0;
      const wallHeight = wall.height;

      const group = new THREE.Group();

      // Wall material for fill sections - matches wall color exactly
      const wallMat = new THREE.MeshStandardMaterial({
        color: 0x00a8cc,
        roughness: 0.6,
        metalness: 0.2,
        transparent: true,
        opacity: 0.85,
        depthWrite: true
      });

      // Opening frame/glass material
      const isDoor = opening.type.startsWith('door');
      const frameMat = new THREE.MeshStandardMaterial({
        color: isDoor ? 0x5c4033 : 0x87ceeb, // Brown for door, light blue for window
        transparent: !isDoor,
        opacity: isDoor ? 1 : 0.4,
        roughness: isDoor ? 0.8 : 0.1,
        metalness: isDoor ? 0 : 0.3
      });

      // For windows: add sill section (wall below window)
      if (sillHeight > 0) {
        const sillGeo = new THREE.BoxGeometry(width, sillHeight, depth);
        const sillMesh = new THREE.Mesh(sillGeo, wallMat);
        sillMesh.position.set(0, sillHeight / 2, 0);
        group.add(sillMesh);
      }

      // Add header section (wall above opening)
      const headerHeight = wallHeight - sillHeight - openingHeight;
      if (headerHeight > 0) {
        const headerGeo = new THREE.BoxGeometry(width, headerHeight, depth);
        const headerMesh = new THREE.Mesh(headerGeo, wallMat);
        headerMesh.position.set(0, sillHeight + openingHeight + headerHeight / 2, 0);
        group.add(headerMesh);
      }

      // Add the opening frame/glass
      if (isDoor) {
        // Door opening void - covers the wall behind
        const voidMat = new THREE.MeshStandardMaterial({
          color: 0x1a1a1a,  // Dark interior
          roughness: 1,
          side: THREE.DoubleSide
        });
        const voidGeo = new THREE.BoxGeometry(width, openingHeight, depth);
        const voidMesh = new THREE.Mesh(voidGeo, voidMat);
        voidMesh.position.set(0, sillHeight + openingHeight / 2, 0);
        group.add(voidMesh);

        // Door panel
        const doorGeo = new THREE.BoxGeometry(width - 2, openingHeight - 2, 2);
        const doorMesh = new THREE.Mesh(doorGeo, frameMat);
        doorMesh.position.set(0, sillHeight + openingHeight / 2, depth / 2 - 1);
        group.add(doorMesh);

        // Door frame
        const frameColor = 0x3d2314;
        const frameMatDark = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.7 });

        // Top frame
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width, 2, depth), frameMatDark);
        topFrame.position.set(0, sillHeight + openingHeight - 1, 0);
        group.add(topFrame);

        // Side frames
        const sideFrame1 = new THREE.Mesh(new THREE.BoxGeometry(2, openingHeight, depth), frameMatDark);
        sideFrame1.position.set(-width / 2 + 1, sillHeight + openingHeight / 2, 0);
        group.add(sideFrame1);

        const sideFrame2 = new THREE.Mesh(new THREE.BoxGeometry(2, openingHeight, depth), frameMatDark);
        sideFrame2.position.set(width / 2 - 1, sillHeight + openingHeight / 2, 0);
        group.add(sideFrame2);

        // Bottom threshold
        const threshold = new THREE.Mesh(new THREE.BoxGeometry(width, 1, depth), frameMatDark);
        threshold.position.set(0, 0.5, 0);
        group.add(threshold);
      } else {
        // Window opening void - covers the wall behind
        const voidMat = new THREE.MeshStandardMaterial({
          color: 0x87ceeb,  // Sky blue for window void
          roughness: 0.1,
          transparent: true,
          opacity: 0.3,
          side: THREE.DoubleSide
        });
        const voidGeo = new THREE.BoxGeometry(width - 2, openingHeight - 2, depth);
        const voidMesh = new THREE.Mesh(voidGeo, voidMat);
        voidMesh.position.set(0, sillHeight + openingHeight / 2, 0);
        group.add(voidMesh);

        // Window glass
        const glassGeo = new THREE.BoxGeometry(width - 4, openingHeight - 4, 1);
        const glassMesh = new THREE.Mesh(glassGeo, frameMat);
        glassMesh.position.set(0, sillHeight + openingHeight / 2, 0);
        group.add(glassMesh);

        // Window frame
        const frameColor = 0xffffff;
        const frameMatLight = new THREE.MeshStandardMaterial({ color: frameColor, roughness: 0.5 });

        // Horizontal frames
        const topFrame = new THREE.Mesh(new THREE.BoxGeometry(width, 2, depth), frameMatLight);
        topFrame.position.set(0, sillHeight + openingHeight - 1, 0);
        group.add(topFrame);

        const bottomFrame = new THREE.Mesh(new THREE.BoxGeometry(width, 2, depth), frameMatLight);
        bottomFrame.position.set(0, sillHeight + 1, 0);
        group.add(bottomFrame);

        // Vertical frames
        const sideFrame1 = new THREE.Mesh(new THREE.BoxGeometry(2, openingHeight, depth), frameMatLight);
        sideFrame1.position.set(-width / 2 + 1, sillHeight + openingHeight / 2, 0);
        group.add(sideFrame1);

        const sideFrame2 = new THREE.Mesh(new THREE.BoxGeometry(2, openingHeight, depth), frameMatLight);
        sideFrame2.position.set(width / 2 - 1, sillHeight + openingHeight / 2, 0);
        group.add(sideFrame2);

        // Center mullion for double windows
        if (opening.type === 'window-double') {
          const mullion = new THREE.Mesh(new THREE.BoxGeometry(2, openingHeight - 4, depth), frameMatLight);
          mullion.position.set(0, sillHeight + openingHeight / 2, 0);
          group.add(mullion);
        }
      }

      group.position.set(pos.x, 0, pos.y);
      group.rotation.y = -angle;

      // Set render order to ensure openings render after walls
      group.traverse(child => {
        if (child.isMesh) {
          child.renderOrder = 2;
        }
      });

      return group;
    }

    // ============================================
    // VIEW SWITCHING
    // ============================================

    function switchTo2D() {
      state.currentView = '2d';

      // Clear selection states and handles before switching
      clearSelectionStates();

      // Remove continuous wall mesh
      if (continuousWallMesh) {
        scene.remove(continuousWallMesh);
        continuousWallMesh = null;
      }

      const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
      const frustumSize = 300;

      camera = new THREE.OrthographicCamera(
        -frustumSize * aspect / 2,
        frustumSize * aspect / 2,
        frustumSize / 2,
        -frustumSize / 2,
        0.1,
        2000
      );
      camera.position.set(0, 500, 0);
      camera.lookAt(0, 0, 0);

      createGrid();
      renderAll();
    }

    function switchTo3D() {
      state.currentView = '3d';

      // Clear selection states and handles before switching
      clearSelectionStates();

      const aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;

      camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 2000);
      camera.position.set(300, 300, 300);
      camera.lookAt(0, 0, 0);

      createGrid();

      // Build continuous wall mesh instead of individual segments
      buildContinuousWallMesh();

      // Render other elements
      if (state.layers.furniture) {
        data.furniture.forEach(furniture => furniture.create3DMesh());
      }
      if (state.layers.dimensions) {
        data.dimensions.forEach(dim => dim.createMesh());
      }
      if (state.layers.annotations) {
        data.annotations.forEach(ann => ann.createMesh());
      }

      updateStats();

      // Enable orbit-like controls with mouse
      setupOrbitControls();
    }

    let orbitState = { isDragging: false, isPanning: false, lastX: 0, lastY: 0, theta: Math.PI / 4, phi: Math.PI / 4, distance: 400 };

    function setupOrbitControls() {
      // Simple orbit implementation
      orbitState = {
        isDragging: false,
        isPanning: false,
        lastX: 0,
        lastY: 0,
        theta: Math.PI / 4,
        phi: Math.PI / 4,
        distance: 400,
        target: new THREE.Vector3(0, 0, 0)
      };
      updateOrbitCamera();
    }

    // 2D pan state
    let panState = {
      isPanning: false,
      lastX: 0,
      lastY: 0,
      offsetX: 0,
      offsetY: 0
    };

    function updateOrbitCamera() {
      if (state.currentView !== '3d') return;

      const x = orbitState.distance * Math.sin(orbitState.phi) * Math.cos(orbitState.theta);
      const y = orbitState.distance * Math.cos(orbitState.phi);
      const z = orbitState.distance * Math.sin(orbitState.phi) * Math.sin(orbitState.theta);

      camera.position.set(
        orbitState.target.x + x,
        orbitState.target.y + y,
        orbitState.target.z + z
      );
      camera.lookAt(orbitState.target);

      // Update label positions when camera moves
      updateLabelPositions();
    }

    // ============================================
    // WALL CONNECTION / SNAPPING
    // ============================================

    function findNearestWallEndpoint(point, excludeWall = null, threshold = 10) {
      let nearest = null;
      let minDist = threshold;

      data.walls.forEach(wall => {
        if (wall === excludeWall) return;

        const distToStart = calculateDistance(point, wall.start);
        const distToEnd = calculateDistance(point, wall.end);

        if (distToStart < minDist) {
          minDist = distToStart;
          nearest = { point: wall.start, wall, isStart: true };
        }
        if (distToEnd < minDist) {
          minDist = distToEnd;
          nearest = { point: wall.end, wall, isStart: false };
        }
      });

      return nearest;
    }

    function findNearestWall(point, threshold = 15) {
      let nearest = null;
      let minDist = threshold;

      data.walls.forEach(wall => {
        const result = wall.distanceToPoint(point);
        if (result.distance < minDist) {
          minDist = result.distance;
          nearest = { wall, ...result };
        }
      });

      return nearest;
    }

    // ============================================
    // SYMBOL HANDLING
    // ============================================

    function getSymbolDefaults(symbolType) {
      const defaults = {
        // Doors
        'door-single': { width: 36, height: 80, sillHeight: 0 },
        'door-double': { width: 60, height: 80, sillHeight: 0 },
        'door-sliding': { width: 72, height: 80, sillHeight: 0 },
        'door-pocket': { width: 36, height: 80, sillHeight: 0 },
        // Windows
        'window-single': { width: 36, height: 48, sillHeight: 36 },
        'window-double': { width: 60, height: 48, sillHeight: 36 },
        'window-bay': { width: 72, height: 48, sillHeight: 24 },
        // Beds (width x depth in inches)
        'bed-single': { width: 38, depth: 75, height: 24 },      // Twin bed
        'bed-double': { width: 54, depth: 75, height: 24 },      // Full bed
        'bed-queen': { width: 60, depth: 80, height: 24 },       // Queen bed
        'bed-king': { width: 76, depth: 80, height: 24 },        // King bed
        'bed': { width: 60, depth: 80, height: 24 },             // Default queen
        // Bedroom furniture
        'nightstand': { width: 20, depth: 20, height: 26 },
        'dresser': { width: 60, depth: 18, height: 32 },
        'wardrobe': { width: 48, depth: 24, height: 72 },
        // Living room
        'sofa': { width: 84, depth: 36, height: 32 },            // 3-seat sofa
        'loveseat': { width: 52, depth: 36, height: 32 },
        'armchair': { width: 32, depth: 34, height: 32 },
        'chair': { width: 20, depth: 20, height: 32 },
        'coffee-table': { width: 48, depth: 24, height: 18 },
        'side-table': { width: 24, depth: 24, height: 24 },
        'tv-stand': { width: 60, depth: 18, height: 24 },
        'bookshelf': { width: 36, depth: 12, height: 72 },
        // Dining
        'table-rect': { width: 72, depth: 36, height: 30 },      // 6-person dining
        'table-round': { width: 48, depth: 48, height: 30 },     // 4-person round
        'dining-chair': { width: 18, depth: 20, height: 32 },
        'bar-stool': { width: 16, depth: 16, height: 30, circular: true },
        'counter-stool': { width: 16, depth: 16, height: 24 },
        // Office
        'desk': { width: 48, depth: 24, height: 30 },
        'office-chair': { width: 24, depth: 24, height: 36 },
        'filing-cabinet': { width: 18, depth: 24, height: 28 },
        // Bathroom
        'toilet': { width: 20, depth: 28, height: 16 },
        'bathtub': { width: 60, depth: 32, height: 20 },
        'shower': { width: 36, depth: 36, height: 80 },
        'sink': { width: 24, depth: 20, height: 34 },
        'vanity': { width: 36, depth: 21, height: 34 },
        // Kitchen
        'refrigerator': { width: 36, depth: 30, height: 70 },
        'stove': { width: 30, depth: 26, height: 36 },
        'dishwasher': { width: 24, depth: 24, height: 34 },
        'sink-kitchen': { width: 33, depth: 22, height: 8 },
        'island': { width: 48, depth: 36, height: 36 },
        // Workshop/Garage
        'workbench': { width: 72, depth: 24, height: 34 },
        'tool-chest': { width: 42, depth: 18, height: 40 },
        'storage-shelf': { width: 48, depth: 18, height: 72 },
        // Workshop Machinery
        'lathe': { width: 54, depth: 20, height: 46 },            // Metal lathe
        'mill': { width: 42, depth: 28, height: 68 },             // Milling machine
        'drill-press': { width: 16, depth: 20, height: 66 },      // Floor drill press
        'bandsaw': { width: 30, depth: 26, height: 68 },          // Vertical bandsaw
        'table-saw': { width: 44, depth: 36, height: 34 },        // Contractor table saw
        'grinder': { width: 20, depth: 12, height: 14 },          // Bench grinder (on bench)
        'cnc-router': { width: 72, depth: 48, height: 42 },       // CNC router table
        'welder': { width: 36, depth: 24, height: 36 },           // Welding station
        // Workshop Tables
        'assembly-table': { width: 60, depth: 36, height: 34 },
        'welding-table': { width: 42, depth: 28, height: 34 },
        'outfeed-table': { width: 30, depth: 24, height: 34 },
        'packing-table': { width: 60, depth: 36, height: 34 },
        // Storage
        'shelving': { width: 48, depth: 18, height: 72 },
        'cabinet': { width: 36, depth: 24, height: 72 },
        'pallet-rack': { width: 96, depth: 42, height: 96 },
        'bin-rack': { width: 36, depth: 18, height: 72 },
        'lumber-rack': { width: 96, depth: 24, height: 72 },
        // Equipment
        'air-compressor': { width: 24, depth: 48, height: 36 },
        'dust-collector': { width: 30, depth: 30, height: 60 },
        'vise': { width: 12, depth: 8, height: 8 },
        'hydraulic-press': { width: 36, depth: 24, height: 72 },
        'forklift': { width: 48, depth: 96, height: 84 },
        'hand-truck': { width: 18, depth: 24, height: 48 },
        'waterjet': { width: 72, depth: 60, height: 42 },
        'sandblaster': { width: 36, depth: 30, height: 48 },
        'air-manifold': { width: 12, depth: 6, height: 24 },
        // Additional items
        'shop-sink': { width: 24, depth: 20, height: 36 },
        'hot-water-heater': { width: 22, depth: 22, height: 60 },
        'motorcycle': { width: 30, depth: 85, height: 42 },  // Royal Enfield Continental GT 650 dimensions
        // Electrical items
        'electrical-panel': { width: 14, depth: 4, height: 30 },   // Wall-mounted breaker panel
        'junction-box': { width: 4, depth: 4, height: 4 },         // Standard junction box
        'outlet': { width: 3, depth: 2, height: 5 },               // Wall outlet
        'light-switch': { width: 3, depth: 2, height: 5 }          // Wall switch
      };
      return defaults[symbolType] || { width: 36, depth: 36, height: 36, sillHeight: 0 };
    }

    function createSymbolFromDrag(symbolType, worldPos) {
      const defaults = getSymbolDefaults(symbolType);

      if (symbolType.startsWith('door') || symbolType.startsWith('window')) {
        // Find nearest wall
        const nearestWall = findNearestWall(worldPos, 30);
        if (nearestWall) {
          const opening = new Opening(
            symbolType,
            nearestWall.wall,
            nearestWall.param,
            defaults.width,
            defaults.height,
            defaults.sillHeight
          );

          data.openings.push(opening);
          nearestWall.wall.openings.push(opening);

          renderAll();
          saveHistory();
        }
      } else {
        // Furniture
        const furniture = new Furniture(
          symbolType,
          worldPos,
          defaults.width,
          defaults.depth || defaults.width,
          defaults.height
        );

        data.furniture.push(furniture);
        renderAll();
        saveHistory();
      }
    }

    // ============================================
    // SELECTION
    // ============================================

    function selectObject(object) {
      // Deselect previous
      if (state.selectedObject) {
        state.selectedObject.setSelected(false);
      }

      // Clear existing handles
      clearFurnitureHandles();

      state.selectedObject = object;

      if (object) {
        object.setSelected(true);
        showPropertiesPanel(object);
        // Show furniture handles and dimension labels for furniture objects
        if (object instanceof Furniture) {
          showFurnitureHandles(object);
        }
      } else {
        hidePropertiesPanel();
      }
    }

    function clearSelectionStates() {
      // Deselect any selected object
      if (state.selectedObject) {
        state.selectedObject.setSelected(false);
        state.selectedObject = null;
      }

      // Clear all selection arrays
      state.selectedWallPoint = null;
      state.selectedWallPoints = [];
      state.selectedObjects = [];

      // Reset dragging states
      state.isDragging = false;
      state.draggingWallPoint = false;
      state.draggingFurnitureHandle = false;
      state.isDrawing = false;
      state.isMarqueeSelecting = false;

      // Clear UI elements
      clearWallPointHandles();
      clearFurnitureHandles();
      hidePropertiesPanel();
      hideMarquee();

      // Reset cursor
      renderer.domElement.style.cursor = 'default';

      // Update status
      document.getElementById('status-mode').textContent = state.currentTool.charAt(0).toUpperCase() + state.currentTool.slice(1);
    }

    function showPropertiesPanel(object) {
      const wallPanel = document.getElementById('selection-properties');
      const furnPanel = document.getElementById('furniture-properties');

      // Hide both panels first
      wallPanel.style.display = 'none';
      furnPanel.style.display = 'none';

      if (object instanceof Furniture) {
        // Show furniture-specific panel
        furnPanel.style.display = 'block';
        document.getElementById('furn-type').textContent = object.type;
        document.getElementById('furn-width').value = Math.round(object.width);
        document.getElementById('furn-depth').value = Math.round(object.depth);
        document.getElementById('furn-height').value = Math.round(object.height);
        document.getElementById('furn-rotation').value = Math.round(object.rotation * 180 / Math.PI) % 360;
      } else {
        // Show wall/opening panel
        wallPanel.style.display = 'block';
        document.getElementById('prop-type').textContent = object.constructor.name;

        if (object instanceof Wall) {
          const length = Math.round(object.length);
          document.getElementById('prop-length').value = length;
          document.getElementById('prop-length-value').textContent = formatMeasurement(length);

          document.getElementById('prop-height').value = object.height;
          document.getElementById('prop-height-value').textContent = `${object.height}"`;

          document.getElementById('prop-thickness').value = object.thickness;
          document.getElementById('prop-thickness-value').textContent = `${object.thickness}"`;
        } else if (object instanceof Opening) {
          document.getElementById('prop-length').value = object.width;
          document.getElementById('prop-length-value').textContent = formatMeasurement(object.width);

          document.getElementById('prop-height').value = object.height;
          document.getElementById('prop-height-value').textContent = `${object.height}"`;

          document.getElementById('prop-thickness').value = object.wall.thickness;
          document.getElementById('prop-thickness-value').textContent = `${object.wall.thickness}"`;
        }
      }
    }

    function hidePropertiesPanel() {
      document.getElementById('selection-properties').style.display = 'none';
      document.getElementById('furniture-properties').style.display = 'none';
    }

    function deleteSelected() {
      // Handle multi-selection delete
      if (state.selectedObjects.length > 0) {
        state.selectedObjects.forEach(obj => deleteObject(obj));
        state.selectedObjects = [];
        selectObject(null);
        clearWallPointHandles();
        clearFurnitureHandles();
        hidePropertiesPanel();
        saveHistory();
        updateStats();
        return;
      }

      if (!state.selectedObject) return;

      const obj = state.selectedObject;
      deleteObject(obj);
      selectObject(null);
      // Clear all selection states
      state.selectedWallPoint = null;
      state.selectedWallPoints = [];
      state.selectedObjects = [];
      clearWallPointHandles();
      clearFurnitureHandles();
      hidePropertiesPanel();
      saveHistory();
      updateStats();
    }

    function deleteObject(obj) {
      if (obj instanceof Wall) {
        // Remove associated openings
        obj.openings.forEach(opening => {
          const idx = data.openings.indexOf(opening);
          if (idx > -1) data.openings.splice(idx, 1);
          opening.remove();
        });

        const idx = data.walls.indexOf(obj);
        if (idx > -1) data.walls.splice(idx, 1);
        obj.remove();
      } else if (obj instanceof Opening) {
        const wallIdx = obj.wall.openings.indexOf(obj);
        if (wallIdx > -1) obj.wall.openings.splice(wallIdx, 1);

        const idx = data.openings.indexOf(obj);
        if (idx > -1) data.openings.splice(idx, 1);
        obj.remove();

        // Rebuild wall mesh
        if (state.currentView === '2d') {
          obj.wall.create2DMesh();
        } else {
          obj.wall.create3DMesh();
        }
      } else if (obj instanceof Furniture) {
        const idx = data.furniture.indexOf(obj);
        if (idx > -1) data.furniture.splice(idx, 1);
        obj.remove();
      } else if (obj instanceof Dimension) {
        const idx = data.dimensions.indexOf(obj);
        if (idx > -1) data.dimensions.splice(idx, 1);
        obj.remove();
      } else if (obj instanceof Annotation) {
        const idx = data.annotations.indexOf(obj);
        if (idx > -1) data.annotations.splice(idx, 1);
        obj.remove();
      } else if (obj instanceof Wire) {
        const idx = data.wires.indexOf(obj);
        if (idx > -1) data.wires.splice(idx, 1);
        obj.remove();
      }
    }

    function findObjectAtPoint(worldPos) {
      // Check furniture first (topmost)
      for (const furniture of data.furniture) {
        const dx = Math.abs(worldPos.x - furniture.position.x);
        const dy = Math.abs(worldPos.y - furniture.position.y);
        if (dx < furniture.width / 2 && dy < furniture.depth / 2) {
          return furniture;
        }
      }

      // Check openings
      for (const opening of data.openings) {
        const pos = opening.worldPosition;
        const dist = calculateDistance(worldPos, pos);
        if (dist < opening.width / 2) {
          return opening;
        }
      }

      // Check walls
      for (const wall of data.walls) {
        const result = wall.distanceToPoint(worldPos);
        if (result.distance < wall.thickness) {
          return wall;
        }
      }

      // Check dimensions
      for (const dim of data.dimensions) {
        const result = {
          distance: Math.min(
            calculateDistance(worldPos, dim.start),
            calculateDistance(worldPos, dim.end),
            calculateDistance(worldPos, dim.midpoint)
          )
        };
        if (result.distance < 10) {
          return dim;
        }
      }

      // Check annotations
      for (const ann of data.annotations) {
        const dist = calculateDistance(worldPos, ann.position);
        if (dist < 15) {
          return ann;
        }
      }

      // Check wires
      for (const wire of data.wires) {
        const dist = wire.distanceToPoint(worldPos);
        if (dist < 8) {
          return wire;
        }
      }

      return null;
    }

    // Find object in 3D view using raycasting
    function getGroundPlaneIntersection(screenX, screenY) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((screenX - rect.left) / rect.width) * 2 - 1,
        -((screenY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Create a ground plane at Y=0
      const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
      const intersection = new THREE.Vector3();

      if (raycaster.ray.intersectPlane(groundPlane, intersection)) {
        // Return in world coordinates (X maps to X, Z maps to Y in our 2D system)
        return { x: intersection.x, y: intersection.z };
      }
      return null;
    }

    function find3DObjectAtPoint(screenX, screenY) {
      const rect = renderer.domElement.getBoundingClientRect();
      const mouse = new THREE.Vector2(
        ((screenX - rect.left) / rect.width) * 2 - 1,
        -((screenY - rect.top) / rect.height) * 2 + 1
      );

      const raycaster = new THREE.Raycaster();
      raycaster.setFromCamera(mouse, camera);

      // Get all meshes to check
      const meshes = [];

      // Add furniture meshes
      data.furniture.forEach(f => {
        if (f.mesh3D) meshes.push(f.mesh3D);
      });

      // Add continuous wall mesh
      if (continuousWallMesh) {
        meshes.push(continuousWallMesh);
      }

      const intersects = raycaster.intersectObjects(meshes, true);

      if (intersects.length > 0) {
        const hit = intersects[0].object;

        // Helper to find root parent group
        function findRootGroup(obj) {
          let current = obj;
          while (current.parent && current.parent !== scene) {
            current = current.parent;
          }
          return current;
        }

        const rootGroup = findRootGroup(hit);

        // Find which object this mesh belongs to
        for (const furniture of data.furniture) {
          if (furniture.mesh3D === rootGroup) {
            return furniture;
          }
        }

        // Check if it's the continuous wall mesh - return first wall
        if (rootGroup === continuousWallMesh) {
          return data.walls.length > 0 ? data.walls[0] : null;
        }
      }

      return null;
    }

    // ============================================
    // HISTORY (UNDO/REDO)
    // ============================================

    function saveHistory() {
      // Simple serialization - deep copy the data
      const snapshot = JSON.stringify({
        walls: data.walls.map(w => ({
          start: { x: w.start.x, y: w.start.y },
          end: { x: w.end.x, y: w.end.y },
          thickness: w.thickness,
          height: w.height
        })),
        openings: data.openings.map(o => ({
          type: o.type,
          wallIndex: data.walls.indexOf(o.wall),
          position: o.position,
          width: o.width,
          height: o.height,
          sillHeight: o.sillHeight
        })),
        furniture: data.furniture.map(f => ({
          type: f.type,
          position: { x: f.position.x, y: f.position.y },
          width: f.width,
          depth: f.depth,
          height: f.height,
          rotation: f.rotation
        })),
        dimensions: data.dimensions.map(d => ({
          start: { x: d.start.x, y: d.start.y },
          end: { x: d.end.x, y: d.end.y }
        })),
        annotations: data.annotations.map(a => ({
          position: { x: a.position.x, y: a.position.y },
          text: a.text
        }))
      });

      // Remove future history if we're not at the end
      state.history = state.history.slice(0, state.historyIndex + 1);
      state.history.push(snapshot);
      state.historyIndex = state.history.length - 1;

      // Limit history size
      if (state.history.length > 50) {
        state.history.shift();
        state.historyIndex--;
      }

      console.log('History saved, index:', state.historyIndex, 'walls:', data.walls.length);
    }

    function restoreFromHistory(snapshot) {
      const parsed = JSON.parse(snapshot);

      // Clear temporary elements
      clearWallPointHandles();
      clearPenStroke();
      clearSimplifiedPreview();
      removeTempWall();
      hideTempDimensionLabel();

      // Clear current data
      data.walls.forEach(w => w.remove());
      data.openings.forEach(o => o.remove());
      data.furniture.forEach(f => f.remove());
      data.dimensions.forEach(d => d.remove());
      data.annotations.forEach(a => a.remove());

      data.walls = [];
      data.openings = [];
      data.furniture = [];
      data.dimensions = [];
      data.annotations = [];

      // Restore walls
      parsed.walls.forEach(w => {
        const wall = new Wall(w.start, w.end, w.thickness, w.height);
        data.walls.push(wall);
      });

      // Restore openings
      parsed.openings.forEach(o => {
        if (o.wallIndex >= 0 && o.wallIndex < data.walls.length) {
          const wall = data.walls[o.wallIndex];
          const opening = new Opening(o.type, wall, o.position, o.width, o.height, o.sillHeight);
          data.openings.push(opening);
          wall.openings.push(opening);
        }
      });

      // Restore furniture
      parsed.furniture.forEach(f => {
        const furniture = new Furniture(f.type, f.position, f.width, f.depth, f.height);
        furniture.rotation = f.rotation;
        data.furniture.push(furniture);
      });

      // Restore dimensions
      parsed.dimensions.forEach(d => {
        const dim = new Dimension(d.start, d.end);
        data.dimensions.push(dim);
      });

      // Restore annotations
      parsed.annotations.forEach(a => {
        const ann = new Annotation(a.position, a.text);
        data.annotations.push(ann);
      });

      renderAll();
    }

    function undo() {
      if (state.historyIndex > 0) {
        state.historyIndex--;
        restoreFromHistory(state.history[state.historyIndex]);
        selectObject(null);
        clearWallPointHandles();
        console.log('Undo to index:', state.historyIndex);
      }
    }

    function redo() {
      if (state.historyIndex < state.history.length - 1) {
        state.historyIndex++;
        restoreFromHistory(state.history[state.historyIndex]);
        selectObject(null);
        clearWallPointHandles();
        console.log('Redo to index:', state.historyIndex);
      }
    }

    // ============================================
    // EVENT HANDLERS
    // ============================================

    function onMouseDown(event) {
      // Only handle events on the canvas
      if (event.target !== renderer.domElement) return;

      // Right click - pan in 2D, rotate camera in 3D
      if (event.button === 2) {
        event.preventDefault();
        if (state.currentView === '2d') {
          panState.isPanning = true;
          panState.lastX = event.clientX;
          panState.lastY = event.clientY;
        } else {
          // Right click rotates camera in 3D
          orbitState.isDragging = true;
          orbitState.lastX = event.clientX;
          orbitState.lastY = event.clientY;
        }
        return;
      }

      // Middle mouse button - pan in both 2D and 3D
      if (event.button === 1) {
        event.preventDefault();
        if (state.currentView === '2d') {
          panState.isPanning = true;
          panState.lastX = event.clientX;
          panState.lastY = event.clientY;
        } else {
          orbitState.isPanning = true;
          orbitState.lastX = event.clientX;
          orbitState.lastY = event.clientY;
        }
        return;
      }

      if (event.button !== 0) return; // Left click only

      const worldPos = screenToWorld(event.clientX, event.clientY);
      const snappedPos = snapPointToGrid(worldPos);

      // Handle scale calibration mode
      if (state.settingScale) {
        handleScaleClick(worldPos);
        return;
      }

      // Handle 3D view interactions
      if (state.currentView === '3d') {
        // Try to select objects in 3D with select tool
        if (state.currentTool === 'select') {
          const obj3D = find3DObjectAtPoint(event.clientX, event.clientY);
          if (obj3D) {
            selectObject(obj3D);
            state.isDragging = true;
            state.drag3DStart = { x: event.clientX, y: event.clientY };
            // Store the initial object position for 3D dragging
            if (obj3D instanceof Furniture) {
              state.drag3DInitialPos = { x: obj3D.position.x, y: obj3D.position.y };
            } else if (obj3D instanceof Wall) {
              state.drag3DInitialPos = { x: obj3D.midpoint.x, y: obj3D.midpoint.y };
            }
            // Get initial ground plane intersection
            state.drag3DGroundStart = getGroundPlaneIntersection(event.clientX, event.clientY);
            return;
          } else {
            // Clicked empty space - deselect current object
            if (state.selectedObject) {
              selectObject(null);
            }
          }
        }
        // Left click in 3D only interacts with tools, not camera rotation
        // Camera rotation is handled by right click
        return;
      }

      switch (state.currentTool) {
        case 'wall':
          // Pen tool behavior
          if (state.editingPoints) {
            // Check if clicking on a control point
            const pointIndex = findControlPointAtPosition(worldPos, state.simplifiedPoints);
            if (pointIndex >= 0) {
              state.selectedPointIndex = pointIndex;
              state.draggingPoint = true;
              updateSimplifiedPreview(state.simplifiedPoints);
            } else {
              // Click elsewhere - confirm the walls
              confirmSimplifiedWalls();
            }
          } else {
            // Start new pen stroke
            state.isDrawing = true;
            state.penPoints = [{ ...worldPos }];
            state.simplifiedPoints = [];
            state.selectedPointIndex = -1;
          }
          break;

        case 'select':
          // First check if clicking on a furniture handle
          const furnitureHandle = findFurnitureHandleAtPosition(worldPos);
          if (furnitureHandle && state.selectedObject === furnitureHandle.furniture) {
            state.selectedFurnitureHandle = furnitureHandle;
            state.draggingFurnitureHandle = true;
            updateFurnitureHandles();
            return;
          }

          // Check if clicking on a wall point handle (any wall, not just selected)
          const wallPoint = findWallPointAtPosition(worldPos);
          if (wallPoint) {
            const ctrlKey = event.ctrlKey || event.metaKey;

            if (ctrlKey) {
              // Ctrl+click: toggle point in multi-selection
              toggleWallPointSelection(wallPoint.wall, wallPoint.point);
              updateWallPointHandles();
              if (state.selectedWallPoints.length > 0) {
                document.getElementById('status-mode').textContent = `${state.selectedWallPoints.length} points selected (Ctrl+click to add/remove)`;
              }
              return;
            }

            // Check if clicking on an already multi-selected point to start dragging all
            if (isWallPointSelected(wallPoint.wall, wallPoint.point)) {
              state.selectedWallPoint = wallPoint;
              state.draggingWallPoint = true;
              // Store initial positions for all selected points
              state.multiDragStartPos = { x: worldPos.x, y: worldPos.y };
              updateWallPointHandles();
              document.getElementById('status-mode').textContent = `Moving ${state.selectedWallPoints.length} points`;
              return;
            }

            // Regular click on wall point (when wall is selected)
            if (state.selectedObject === wallPoint.wall) {
              // Clear multi-selection when doing single point drag
              clearWallPointSelection();
              state.selectedWallPoint = wallPoint;
              state.draggingWallPoint = true;
              updateWallPointHandles();
              document.getElementById('status-mode').textContent = 'Resize Room (Hold Shift for free move)';
              return;
            }
          }

          const obj = findObjectAtPoint(worldPos);
          const ctrlKey = event.ctrlKey || event.metaKey;

          // Ctrl+click for object multi-selection
          if (ctrlKey && obj) {
            // Toggle object in multi-selection
            const index = state.selectedObjects.findIndex(o => o.id === obj.id);
            if (index >= 0) {
              // Remove from selection
              state.selectedObjects.splice(index, 1);
              obj.setSelected(false);
            } else {
              // Add to selection
              if (state.selectedObject && !state.selectedObjects.find(o => o.id === state.selectedObject.id)) {
                state.selectedObjects.push(state.selectedObject);
              }
              state.selectedObjects.push(obj);
              obj.setSelected(true);
            }

            // Update status
            if (state.selectedObjects.length > 0) {
              document.getElementById('status-mode').textContent = `${state.selectedObjects.length} objects selected (Ctrl+click to add/remove)`;
            } else {
              document.getElementById('status-mode').textContent = 'Select';
            }
            return;
          }

          // Clear multi-selection when selecting a new object (unless Ctrl is held)
          if (!ctrlKey) {
            clearWallPointSelection();
            // Deselect multi-selected objects
            state.selectedObjects.forEach(o => o.setSelected(false));
            state.selectedObjects = [];
          }

          selectObject(obj);
          state.selectedWallPoint = null;
          state.selectedFurnitureHandle = null;

          if (obj) {
            state.isDragging = true;
            if (obj instanceof Wall) {
              // Store offset from wall midpoint
              const mid = obj.midpoint;
              state.dragOffset = {
                x: worldPos.x - mid.x,
                y: worldPos.y - mid.y
              };
              // Show wall point handles
              updateWallPointHandles();
              clearFurnitureHandles();
            } else if (obj instanceof Furniture) {
              state.dragOffset = {
                x: worldPos.x - obj.position.x,
                y: worldPos.y - obj.position.y
              };
              // Show furniture handles
              updateFurnitureHandles();
              clearWallPointHandles();
            } else if (obj instanceof Opening) {
              state.dragOffset = {
                x: 0,
                y: 0
              };
            } else if (obj instanceof Annotation) {
              state.dragOffset = {
                x: worldPos.x - obj.position.x,
                y: worldPos.y - obj.position.y
              };
            }
          } else {
            // Start marquee selection when clicking on empty space
            state.isMarqueeSelecting = true;
            state.marqueeStart = { x: event.clientX, y: event.clientY };
            state.marqueeStartWorld = { x: worldPos.x, y: worldPos.y };
            state.marqueeEnd = { x: event.clientX, y: event.clientY };

            // Clear existing selection unless Ctrl is held
            if (!(event.ctrlKey || event.metaKey)) {
              clearWallPointSelection();
              state.selectedObjects = [];
            }

            clearWallPointHandles();
            clearFurnitureHandles();
          }
          break;

        case 'dimension':
          if (!state.isDrawing) {
            state.dimensionStart = snappedPos;
            state.isDrawing = true;
          } else {
            const dim = new Dimension(state.dimensionStart, snappedPos);
            data.dimensions.push(dim);
            dim.createMesh();
            saveHistory();

            state.isDrawing = false;
            state.dimensionStart = null;
            hideTempDimensionLabel();
          }
          break;

        case 'annotate':
          const text = prompt('Enter annotation text:', 'Note');
          if (text) {
            const ann = new Annotation(snappedPos, text);
            data.annotations.push(ann);
            ann.createMesh();
            saveHistory();
          }
          break;

        case 'rect':
          // Start drawing rectangle
          state.rectStart = snappedPos;
          state.rectEnd = snappedPos;
          state.isDrawingRect = true;
          break;

        case 'shape':
          // Freeform polygon drawing
          state.shapePoints.push(snappedPos);
          if (state.shapePoints.length >= 3) {
            const first = state.shapePoints[0];
            const last = state.shapePoints[state.shapePoints.length - 1];
            if (calculateDistance(first, last) < 15) {
              // Close the shape - create furniture
              const center = {
                x: state.shapePoints.reduce((sum, p) => sum + p.x, 0) / state.shapePoints.length,
                y: state.shapePoints.reduce((sum, p) => sum + p.y, 0) / state.shapePoints.length
              };

              // Calculate bounding box
              const minX = Math.min(...state.shapePoints.map(p => p.x));
              const maxX = Math.max(...state.shapePoints.map(p => p.x));
              const minY = Math.min(...state.shapePoints.map(p => p.y));
              const maxY = Math.max(...state.shapePoints.map(p => p.y));

              const furniture = new Furniture('custom', center, maxX - minX, maxY - minY, 30);
              data.furniture.push(furniture);
              renderAll();
              saveHistory();

              state.shapePoints = [];
              clearTempShapeLines();
            }
          }
          updateTempShapeLines();
          break;

        case 'wire':
          // Wire drawing - click to add points
          // Try to snap to electrical objects first
          const electricalSnap = getElectricalSnapPoint(worldPos);
          const wirePoint = electricalSnap || snappedPos;

          if (!state.isDrawingWire) {
            // Start a new wire
            state.isDrawingWire = true;
            state.wirePoints = [{ ...wirePoint }];
            if (electricalSnap) {
              document.getElementById('status-mode').textContent = 'Wire: Connected to electrical object - Click to add points, Double-click to finish';
            }
          } else {
            // Add a point to the current wire
            state.wirePoints.push({ ...wirePoint });
            if (electricalSnap) {
              document.getElementById('status-mode').textContent = 'Wire: Connected to electrical object - Double-click to finish';
            }
          }
          updateTempWireLine();
          break;
      }
    }

    function onMouseMove(event) {
      const worldPos = screenToWorld(event.clientX, event.clientY);
      // Shift key disables grid snapping
      const snappedPos = event.shiftKey ? { x: worldPos.x, y: worldPos.y } : snapPointToGrid(worldPos);

      // Update status bar
      document.getElementById('status-mouse').textContent =
        `${Math.round(snappedPos.x)}, ${Math.round(snappedPos.y)}`;

      // Handle scale calibration
      if (state.settingScale && state.scalePoint1) {
        updateScalePreviewLine(worldPos);
        return;
      }

      // Handle 2D panning - drag to move view in mouse direction
      if (state.currentView === '2d' && panState.isPanning) {
        const deltaX = event.clientX - panState.lastX;
        const deltaY = event.clientY - panState.lastY;

        // Convert screen delta to world delta (content follows mouse - like dragging paper)
        const worldDeltaX = deltaX / camera.zoom;
        const worldDeltaY = deltaY / camera.zoom;

        // Grab and drag - content follows mouse (camera moves opposite)
        camera.position.x -= worldDeltaX;
        camera.position.z -= worldDeltaY;

        panState.lastX = event.clientX;
        panState.lastY = event.clientY;

        updateLabelPositions();
        updateRulers();
        return;
      }

      // Handle marquee selection
      if (state.isMarqueeSelecting && state.currentTool === 'select') {
        state.marqueeEnd = { x: event.clientX, y: event.clientY };
        updateMarqueeVisual();
        updateMarqueePreviewSelection();
        return;
      }

      // Handle 3D orbit
      if (state.currentView === '3d' && orbitState.isDragging) {
        const deltaX = event.clientX - orbitState.lastX;
        const deltaY = event.clientY - orbitState.lastY;

        orbitState.theta += deltaX * 0.01;
        orbitState.phi = Math.max(0.1, Math.min(Math.PI / 2 - 0.1, orbitState.phi + deltaY * 0.01));

        orbitState.lastX = event.clientX;
        orbitState.lastY = event.clientY;

        updateOrbitCamera();
        return;
      }

      // Handle 3D panning
      if (state.currentView === '3d' && orbitState.isPanning) {
        const deltaX = event.clientX - orbitState.lastX;
        const deltaY = event.clientY - orbitState.lastY;

        // Pan the target point
        const panSpeed = orbitState.distance * 0.002;
        const right = new THREE.Vector3();
        const up = new THREE.Vector3(0, 1, 0);

        camera.getWorldDirection(right);
        right.cross(up).normalize();

        orbitState.target.x -= right.x * deltaX * panSpeed;
        orbitState.target.z -= right.z * deltaX * panSpeed;
        orbitState.target.x += Math.sin(orbitState.theta) * deltaY * panSpeed;
        orbitState.target.z += Math.cos(orbitState.theta) * deltaY * panSpeed;

        orbitState.lastX = event.clientX;
        orbitState.lastY = event.clientY;

        updateOrbitCamera();
        return;
      }

      // Handle 3D object dragging
      if (state.currentView === '3d' && state.isDragging && state.selectedObject && state.currentTool === 'select') {
        const groundPos = getGroundPlaneIntersection(event.clientX, event.clientY);
        if (groundPos && state.drag3DGroundStart && state.drag3DInitialPos) {
          const dx = groundPos.x - state.drag3DGroundStart.x;
          const dy = groundPos.y - state.drag3DGroundStart.y;

          const obj = state.selectedObject;
          if (obj instanceof Furniture) {
            let newX = state.drag3DInitialPos.x + dx;
            let newY = state.drag3DInitialPos.y + dy;
            // Apply grid snapping unless shift is held
            if (!event.shiftKey) {
              newX = snapToGrid(newX);
              newY = snapToGrid(newY);
            }
            obj.position.x = newX;
            obj.position.y = newY;
            obj.create3DMesh();
            // Also update 2D mesh position so it syncs when switching views
            if (obj.mesh) {
              obj.mesh.position.set(obj.position.x, 0.2, obj.position.y);
            }
          } else if (obj instanceof Wall) {
            const midDx = (state.drag3DInitialPos.x + dx) - obj.midpoint.x;
            const midDy = (state.drag3DInitialPos.y + dy) - obj.midpoint.y;
            obj.start.x += midDx;
            obj.start.y += midDy;
            obj.end.x += midDx;
            obj.end.y += midDy;
            buildContinuousWallMesh();
            // Also update 2D mesh
            obj.create2DMesh();
          }
          renderer.domElement.style.cursor = 'move';
        }
        return;
      }

      // Handle dragging wall point(s)
      if (state.draggingWallPoint && state.selectedWallPoint && state.currentTool === 'select') {
        const { wall, point } = state.selectedWallPoint;
        const mergeThreshold = 15;
        const shiftKey = event.shiftKey;

        // Multi-point drag mode
        if (state.selectedWallPoints.length > 0 && state.multiDragStartPos) {
          // Calculate delta from start position
          const dx = snappedPos.x - (state.multiDragLastPos ? state.multiDragLastPos.x : state.multiDragStartPos.x);
          const dy = snappedPos.y - (state.multiDragLastPos ? state.multiDragLastPos.y : state.multiDragStartPos.y);

          if (dx !== 0 || dy !== 0) {
            // Move all selected points by the delta
            moveSelectedWallPoints(dx, dy);
            state.multiDragLastPos = { x: snappedPos.x, y: snappedPos.y };
          }

          renderer.domElement.style.cursor = 'move';
          updateWallPointHandles();

          // Show status
          document.getElementById('status-mode').textContent = `Moving ${state.selectedWallPoints.length} points`;
          return;
        }

        // Single point drag mode (original behavior)
        // Check if near another wall's endpoint for snapping/merging (only in free mode)
        let snapTarget = null;
        if (shiftKey) {
          for (const otherWall of data.walls) {
            if (otherWall === wall) continue;
            // Skip walls already connected to this point
            const currentPos = getWallPointPos(wall, point);
            const connectedWalls = findWallsAtPoint(currentPos, wall);
            const isConnected = connectedWalls.some(cw => cw.wall === otherWall);
            if (isConnected) continue;

            if (calculateDistance(snappedPos, otherWall.start) < mergeThreshold) {
              snapTarget = { wall: otherWall, point: 'start', pos: otherWall.start };
              break;
            }
            if (calculateDistance(snappedPos, otherWall.end) < mergeThreshold) {
              snapTarget = { wall: otherWall, point: 'end', pos: otherWall.end };
              break;
            }
          }
        }

        // Also check if dragging onto the OTHER end of the same wall (to make it zero length - will be deleted)
        const otherEnd = point === 'start' ? wall.end : wall.start;
        if (calculateDistance(snappedPos, otherEnd) < mergeThreshold) {
          // Wall would become zero length - highlight for deletion
          renderer.domElement.style.cursor = 'not-allowed';
        } else {
          renderer.domElement.style.cursor = shiftKey ? (snapTarget ? 'copy' : 'move') : 'nwse-resize';
        }

        // Apply position with constraints, including H/V alignment snap
        let newPos = snapTarget ? snapTarget.pos : snappedPos;

        // Apply H/V alignment snapping (subtle snap to horizontal/vertical with other walls)
        if (!snapTarget) {
          const connectedWalls = findWallsAtPoint(getWallPointPos(wall, point), wall);
          const excludeWalls = [wall, ...connectedWalls.map(cw => cw.wall)];
          newPos = snapPointWithHVAlignment(snappedPos, excludeWalls);
        }

        moveWallPointWithConstraints(wall, point, newPos, shiftKey);

        updateWallPointHandles();

        // Store snap target for merge on mouse up
        state.wallPointSnapTarget = shiftKey ? snapTarget : null;

        // Update length display - show all connected wall lengths
        const currentPos = getWallPointPos(wall, point);
        const connectedWalls = findWallsAtPoint(currentPos, wall);
        if (connectedWalls.length > 0) {
          const lengths = [wall, ...connectedWalls.map(cw => cw.wall)]
            .map(w => formatMeasurement(w.length))
            .join(' × ');
          document.getElementById('status-length').textContent = lengths;
        } else {
          document.getElementById('status-length').textContent = formatMeasurement(wall.length);
        }
        return;
      }

      // Handle dragging furniture handle
      if (state.draggingFurnitureHandle && state.selectedFurnitureHandle && state.currentTool === 'select') {
        const { furniture, corner, edge, radiusHandle } = state.selectedFurnitureHandle;
        renderer.domElement.style.cursor = 'nwse-resize';

        if (radiusHandle) {
          // Circular furniture - adjust radius
          const cx = furniture.position.x;
          const cy = furniture.position.y;
          const newRadius = calculateDistance({ x: cx, y: cy }, snappedPos);
          furniture.width = Math.max(12, newRadius * 2);
          furniture.depth = furniture.width; // Keep it circular
        } else if (corner) {
          // Corner resize - adjust both width and depth
          const cx = furniture.position.x;
          const cy = furniture.position.y;
          const rot = furniture.rotation;
          const cos = Math.cos(-rot);
          const sin = Math.sin(-rot);

          // Convert snapped pos to local coords
          const localX = (snappedPos.x - cx) * cos - (snappedPos.y - cy) * sin;
          const localY = (snappedPos.x - cx) * sin + (snappedPos.y - cy) * cos;

          // Determine which corner and adjust accordingly
          // Use absolute distance from cursor to center for sizing
          if (corner === 'topLeft') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          } else if (corner === 'topRight') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          } else if (corner === 'bottomRight') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          } else if (corner === 'bottomLeft') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          }
        } else if (edge !== undefined) {
          // Edge resize - adjust only width or depth
          const cx = furniture.position.x;
          const cy = furniture.position.y;
          const rot = furniture.rotation;
          const cos = Math.cos(-rot);
          const sin = Math.sin(-rot);

          // Convert snapped pos to local coords
          const localX = (snappedPos.x - cx) * cos - (snappedPos.y - cy) * sin;
          const localY = (snappedPos.x - cx) * sin + (snappedPos.y - cy) * cos;

          // Use absolute distance for edge sizing
          if (edge === 'top') {
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          } else if (edge === 'bottom') {
            furniture.depth = Math.max(12, Math.abs(localY) * 2);
          } else if (edge === 'left') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
          } else if (edge === 'right') {
            furniture.width = Math.max(12, Math.abs(localX) * 2);
          }
        }

        furniture.create2DMesh();
        updateFurnitureHandles();

        // Update status with dimensions
        document.getElementById('status-length').textContent =
          `${formatMeasurement(furniture.width)} × ${formatMeasurement(furniture.depth)}`;
        return;
      }

      // Handle dragging selected object
      if (state.isDragging && state.selectedObject && state.currentTool === 'select') {
        const obj = state.selectedObject;
        const newX = snappedPos.x - state.dragOffset.x;
        const newY = snappedPos.y - state.dragOffset.y;

        if (obj instanceof Wall) {
          // Move wall by translating both endpoints
          const mid = obj.midpoint;
          const dx = newX - mid.x;
          const dy = newY - mid.y;

          obj.start.x += dx;
          obj.start.y += dy;
          obj.end.x += dx;
          obj.end.y += dy;

          // Also move associated openings
          obj.openings.forEach(opening => {
            opening.remove();
            opening.create2DMesh();
          });

          obj.create2DMesh();
        } else if (obj instanceof Furniture) {
          obj.position.x = newX;
          obj.position.y = newY;
          obj.create2DMesh();
          // Update furniture handles and measurement labels during drag
          showFurnitureHandles(obj);
        } else if (obj instanceof Opening) {
          // Move opening along wall
          const wall = obj.wall;
          const result = wall.distanceToPoint(snappedPos);
          obj.position = Math.max(0.05, Math.min(0.95, result.param));
          obj.remove();
          obj.create2DMesh();
          // Rebuild wall mesh to show opening
          wall.create2DMesh();
        } else if (obj instanceof Annotation) {
          obj.position.x = newX;
          obj.position.y = newY;
          obj.updateLabelPosition();
        }
        return;
      }

      // Tool-specific preview
      switch (state.currentTool) {
        case 'wall':
          if (state.isDrawing && !state.editingPoints) {
            // Pen tool: collect points while drawing
            const lastPoint = state.penPoints[state.penPoints.length - 1];
            if (calculateDistance(lastPoint, worldPos) > 3) {
              state.penPoints.push({ ...worldPos });
              updatePenStroke(state.penPoints);

              // Update total length in status
              let totalLength = 0;
              for (let i = 1; i < state.penPoints.length; i++) {
                totalLength += calculateDistance(state.penPoints[i-1], state.penPoints[i]);
              }
              document.getElementById('status-length').textContent = formatMeasurement(totalLength);
            }
          } else if (state.draggingPoint && state.editingPoints) {
            // Dragging a control point
            state.simplifiedPoints[state.selectedPointIndex] = { ...snappedPos };
            updateSimplifiedPreview(state.simplifiedPoints);

            // Update length display
            let totalLength = 0;
            for (let i = 1; i < state.simplifiedPoints.length; i++) {
              totalLength += calculateDistance(state.simplifiedPoints[i-1], state.simplifiedPoints[i]);
            }
            document.getElementById('status-length').textContent = formatMeasurement(totalLength);
          } else if (state.editingPoints) {
            // Hover detection on control points
            const pointIndex = findControlPointAtPosition(worldPos, state.simplifiedPoints);
            if (pointIndex !== state.hoveredPointIndex) {
              state.hoveredPointIndex = pointIndex;
              updateSimplifiedPreview(state.simplifiedPoints);
              renderer.domElement.style.cursor = pointIndex >= 0 ? 'pointer' : 'crosshair';
            }
          }
          break;

        case 'dimension':
          if (state.isDrawing) {
            updateTempDimensionLabel(state.dimensionStart, snappedPos);
          }
          break;

        case 'rect':
          if (state.isDrawingRect && state.rectStart) {
            state.rectEnd = snappedPos;
            updateRectPreview(state.rectStart, state.rectEnd);

            // Update status with dimensions
            const width = Math.abs(state.rectEnd.x - state.rectStart.x);
            const height = Math.abs(state.rectEnd.y - state.rectStart.y);
            document.getElementById('status-length').textContent =
              `${formatMeasurement(width)} × ${formatMeasurement(height)}`;
          }
          break;

        case 'shape':
          if (state.shapePoints.length > 0) {
            updateTempShapeLines(snappedPos);
          }
          break;

        case 'select':
          // Hover detection for wall points
          if (state.selectedObject instanceof Wall && !state.isDragging && !state.draggingWallPoint) {
            const wallPoint = findWallPointAtPosition(worldPos);
            if (wallPoint && wallPoint.wall === state.selectedObject) {
              if (!state.hoveredWallPoint ||
                  state.hoveredWallPoint.wall !== wallPoint.wall ||
                  state.hoveredWallPoint.point !== wallPoint.point) {
                state.hoveredWallPoint = wallPoint;
                updateWallPointHandles();
                renderer.domElement.style.cursor = 'pointer';
              }
            } else if (state.hoveredWallPoint) {
              state.hoveredWallPoint = null;
              updateWallPointHandles();
              renderer.domElement.style.cursor = 'default';
            }
          }
          break;
      }
    }

    function onMouseUp(event) {
      // Stop panning
      panState.isPanning = false;
      orbitState.isPanning = false;

      if (state.currentView === '3d') {
        orbitState.isDragging = false;
      }

      // Complete marquee selection
      if (state.isMarqueeSelecting) {
        completeMarqueeSelection();
      }

      if (state.isDragging && state.selectedObject) {
        saveHistory();
      }
      state.isDragging = false;
      state.drag3DStart = null;
      state.drag3DInitialPos = null;
      state.drag3DGroundStart = null;

      // Stop dragging wall point
      if (state.draggingWallPoint) {
        state.draggingWallPoint = false;

        // Reset multi-drag state
        state.multiDragStartPos = null;
        state.multiDragLastPos = null;

        // Check if we need to merge points (only for single point drag)
        if (state.wallPointSnapTarget && state.selectedWallPoint && state.selectedWallPoints.length === 0) {
          mergeWallPoints(state.selectedWallPoint, state.wallPointSnapTarget);
        }

        // Check if wall became zero length (delete it) - only for single point drag
        if (state.selectedWallPoint && state.selectedWallPoints.length === 0) {
          const wall = state.selectedWallPoint.wall;
          if (wall.length < 5) {
            wall.remove();
            data.walls = data.walls.filter(w => w !== wall);
            selectObject(null);
            clearWallPointHandles();
          }
        }

        state.wallPointSnapTarget = null;
        renderer.domElement.style.cursor = 'default';
        document.getElementById('status-mode').textContent = state.selectedWallPoints.length > 0
          ? `${state.selectedWallPoints.length} points selected`
          : 'Select';
        saveHistory();
      }

      // Stop dragging furniture handle
      if (state.draggingFurnitureHandle) {
        state.draggingFurnitureHandle = false;
        state.selectedFurnitureHandle = null;
        renderer.domElement.style.cursor = 'default';
        saveHistory();
      }

      // Rectangle tool: create walls on mouse up
      if (state.currentTool === 'rect' && state.isDrawingRect) {
        if (state.rectStart && state.rectEnd) {
          const width = Math.abs(state.rectEnd.x - state.rectStart.x);
          const height = Math.abs(state.rectEnd.y - state.rectStart.y);

          // Only create if rectangle is large enough
          if (width > 10 && height > 10) {
            createRectangleWalls(state.rectStart, state.rectEnd);
          }
        }

        clearRectPreview();
        clearRectLabels();
        state.isDrawingRect = false;
        state.rectStart = null;
        state.rectEnd = null;
      }

      // Pen tool: on mouse up, simplify the stroke
      if (state.currentTool === 'wall' && state.isDrawing && !state.editingPoints) {
        if (state.penPoints.length >= 2) {
          // Simplify the path
          state.simplifiedPoints = simplifyPath(state.penPoints, state.simplifyTolerance);

          // Clear the freehand stroke and show simplified preview with control points
          clearPenStroke();
          updateSimplifiedPreview(state.simplifiedPoints);

          state.editingPoints = true;
          state.isDrawing = false;

          document.getElementById('status-mode').textContent = 'Editing Points (Click to confirm, Esc to cancel)';
        } else {
          // Too few points, cancel
          clearPenStroke();
          state.penPoints = [];
          state.isDrawing = false;
        }
      }

      // Stop dragging control point
      if (state.draggingPoint) {
        state.draggingPoint = false;
      }
    }

    function confirmSimplifiedWalls() {
      if (state.simplifiedPoints.length < 2) {
        cancelPenTool();
        return;
      }

      // Create wall segments from simplified points
      for (let i = 0; i < state.simplifiedPoints.length - 1; i++) {
        const start = state.simplifiedPoints[i];
        const end = state.simplifiedPoints[i + 1];

        if (calculateDistance(start, end) > 5) {
          const wall = new Wall(
            start,
            end,
            state.defaultWallThickness,
            state.defaultWallHeight
          );
          data.walls.push(wall);
          wall.create2DMesh();
        }
      }

      saveHistory();

      // Reset pen tool state
      clearSimplifiedPreview();
      state.editingPoints = false;
      state.simplifiedPoints = [];
      state.penPoints = [];
      state.selectedPointIndex = -1;
      state.hoveredPointIndex = -1;

      document.getElementById('status-mode').textContent = 'Wall Drawing';
      document.getElementById('status-length').textContent = '-';
      renderer.domElement.style.cursor = 'crosshair';
    }

    function cancelPenTool() {
      clearPenStroke();
      clearSimplifiedPreview();

      state.isDrawing = false;
      state.editingPoints = false;
      state.penPoints = [];
      state.simplifiedPoints = [];
      state.selectedPointIndex = -1;
      state.hoveredPointIndex = -1;
      state.draggingPoint = false;

      document.getElementById('status-mode').textContent = 'Wall Drawing';
      document.getElementById('status-length').textContent = '-';
      renderer.domElement.style.cursor = 'crosshair';
    }

    function onDoubleClick(event) {
      const worldPos = screenToWorld(event.clientX, event.clientY);

      // Handle double-click to finish wire
      if (state.currentTool === 'wire' && state.isDrawingWire && state.wirePoints.length >= 2) {
        finishWireDrawing();
        return;
      }

      // Handle double-click on wall point in select mode - select all connected walls
      if (state.currentTool === 'select') {
        const wallPoint = findWallPointAtPosition(worldPos);
        if (wallPoint) {
          const pos = wallPoint.point === 'start' ? wallPoint.wall.start : wallPoint.wall.end;
          // Clear current selection and select all walls at this junction
          clearWallPointSelection();
          selectAllWallPointsAtPosition(pos);
          updateWallPointHandles();
          if (state.selectedWallPoints.length > 0) {
            document.getElementById('status-mode').textContent = `Selected ${state.selectedWallPoints.length} connected points (drag to move together)`;
          }
          return;
        }
      }

      if (state.currentTool === 'wall' && state.editingPoints) {
        const snappedPos = snapPointToGrid(worldPos);

        // Check if double-clicking on an existing point to delete it
        const pointIndex = findControlPointAtPosition(worldPos, state.simplifiedPoints);
        if (pointIndex >= 0) {
          // Delete point if we have more than 2
          if (state.simplifiedPoints.length > 2) {
            state.simplifiedPoints.splice(pointIndex, 1);
            state.selectedPointIndex = -1;
            updateSimplifiedPreview(state.simplifiedPoints);
          }
          return;
        }

        // Otherwise, check if double-clicking on a line segment to add a point
        for (let i = 0; i < state.simplifiedPoints.length - 1; i++) {
          const start = state.simplifiedPoints[i];
          const end = state.simplifiedPoints[i + 1];

          // Check distance from point to line segment
          const dist = perpendicularDistance(worldPos, start, end);
          if (dist < 10) {
            // Insert new point
            state.simplifiedPoints.splice(i + 1, 0, { ...snappedPos });
            state.selectedPointIndex = i + 1;
            updateSimplifiedPreview(state.simplifiedPoints);
            return;
          }
        }
      }
    }

    function onWheel(event) {
      event.preventDefault();

      if (state.currentView === '3d') {
        orbitState.distance += event.deltaY * 0.5;
        orbitState.distance = Math.max(50, orbitState.distance); // Only minimum bound
        updateOrbitCamera();
      } else {
        // Zoom 2D camera - no upper/lower bounds for infinite zoom
        const zoomFactor = event.deltaY > 0 ? 1.1 : 0.9;
        camera.zoom *= 1 / zoomFactor;
        // Only set a reasonable minimum to prevent zoom = 0
        camera.zoom = Math.max(0.01, camera.zoom);
        camera.updateProjectionMatrix();

        // Update grid to match new zoom level
        createGrid();

        // Update rulers
        updateRulers();

        updateLabelPositions();
      }
    }

    function onKeyDown(event) {
      // Handle Enter to confirm walls when editing points
      if (event.key === 'Enter' && state.editingPoints) {
        confirmSimplifiedWalls();
        return;
      }

      // Handle Delete to remove selected control point (pen tool)
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.editingPoints && state.selectedPointIndex >= 0) {
        if (state.simplifiedPoints.length > 2) {
          state.simplifiedPoints.splice(state.selectedPointIndex, 1);
          state.selectedPointIndex = -1;
          updateSimplifiedPreview(state.simplifiedPoints);
        }
        return;
      }

      // Handle Delete to remove/merge wall point (after placement)
      if ((event.key === 'Delete' || event.key === 'Backspace') && state.selectedWallPoint && state.currentTool === 'select') {
        deleteWallPoint(state.selectedWallPoint);
        return;
      }

      // Tool shortcuts (only if not editing points)
      if (!state.editingPoints) {
        switch (event.key.toLowerCase()) {
          case 'w':
            setTool('wall');
            break;
          case 'r':
            setTool('rect');
            break;
          case 'v':
            setTool('select');
            break;
          case 'd':
            setTool('dimension');
            break;
          case 'a':
            setTool('annotate');
            break;
          case 's':
            setTool('shape');
            break;
          case 'e':
            setTool('wire');
            break;
          case 'q':
            // Toggle between 2D and 3D view
            if (state.currentView === '2d') {
              document.getElementById('btn-3d').click();
            } else {
              document.getElementById('btn-2d').click();
            }
            break;
        }
      }

      switch (event.key) {
        case 'Escape':
          cancelCurrentAction();
          break;
        case 'Delete':
        case 'Backspace':
          if (!state.editingPoints) {
            deleteSelected();
          }
          break;
        case 'ArrowLeft':
        case 'ArrowRight':
          // Rotate selected furniture object
          if (state.selectedObject && state.selectedObject instanceof Furniture) {
            event.preventDefault();
            // Default is 90 degrees, shift for fine 1-degree rotation
            const rotationStep = event.shiftKey ? (Math.PI / 180) : (Math.PI / 2); // Normal = 90 degrees, Shift = 1 degree
            const direction = event.key === 'ArrowLeft' ? -1 : 1;
            const obj = state.selectedObject;
            obj.rotation = obj.rotation + direction * rotationStep;
            // Normalize to 0 to 2*PI range
            while (obj.rotation < 0) obj.rotation += Math.PI * 2;
            while (obj.rotation >= Math.PI * 2) obj.rotation -= Math.PI * 2;
            obj.create2DMesh();
            obj.create3DMesh();
            showFurnitureHandles(obj);
            saveHistory();
          }
          break;
      }

      if (event.key.toLowerCase() === 'z' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
      }

      if (event.key.toLowerCase() === 'y' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        redo();
      }

      if (event.key.toLowerCase() === 's' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        saveProject();
      }

      if (event.key.toLowerCase() === 'o' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        document.getElementById('load-input').click();
      }

      // Copy
      if (event.key.toLowerCase() === 'c' && (event.ctrlKey || event.metaKey)) {
        if (state.selectedObject) {
          event.preventDefault();
          const obj = state.selectedObject;
          if (obj instanceof Furniture) {
            state.clipboard = {
              type: 'furniture',
              data: {
                type: obj.type,
                width: obj.width,
                depth: obj.depth,
                height: obj.height,
                rotation: obj.rotation
              }
            };
            document.getElementById('status-mode').textContent = 'Copied furniture';
          } else if (obj instanceof Wall) {
            state.clipboard = {
              type: 'wall',
              data: {
                length: obj.length,
                thickness: obj.thickness,
                height: obj.height,
                angle: Math.atan2(obj.end.y - obj.start.y, obj.end.x - obj.start.x)
              }
            };
            document.getElementById('status-mode').textContent = 'Copied wall';
          }
        }
      }

      // Paste
      if (event.key.toLowerCase() === 'v' && (event.ctrlKey || event.metaKey)) {
        if (state.clipboard) {
          event.preventDefault();
          const center = screenToWorld(window.innerWidth / 2, window.innerHeight / 2);
          const offset = 20; // Offset from center or original position

          if (state.clipboard.type === 'furniture') {
            const d = state.clipboard.data;
            const furniture = new Furniture(
              d.type,
              { x: center.x + offset, y: center.y + offset },
              d.width,
              d.depth,
              d.height
            );
            furniture.rotation = d.rotation;
            furniture.create2DMesh();
            furniture.create3DMesh();
            data.furniture.push(furniture);
            selectObject(furniture);
            saveHistory();
            document.getElementById('status-mode').textContent = 'Pasted furniture';
          } else if (state.clipboard.type === 'wall') {
            const d = state.clipboard.data;
            const halfLen = d.length / 2;
            const wall = new Wall(
              { x: center.x - halfLen * Math.cos(d.angle), y: center.y - halfLen * Math.sin(d.angle) },
              { x: center.x + halfLen * Math.cos(d.angle), y: center.y + halfLen * Math.sin(d.angle) },
              d.thickness,
              d.height
            );
            wall.create2DMesh();
            wall.create3DMesh();
            data.walls.push(wall);
            buildContinuousWallMesh();
            selectObject(wall);
            saveHistory();
            document.getElementById('status-mode').textContent = 'Pasted wall';
          }
        }
      }
    }

    function cancelCurrentAction() {
      state.isDrawing = false;
      state.wallStart = null;
      state.dimensionStart = null;
      state.shapePoints = [];

      // Cancel pen tool
      if (state.currentTool === 'wall') {
        cancelPenTool();
      }

      // Cancel rect tool
      if (state.currentTool === 'rect') {
        clearRectPreview();
        clearRectLabels();
        state.isDrawingRect = false;
        state.rectStart = null;
        state.rectEnd = null;
      }

      removeTempWall();
      hideTempDimensionLabel();
      clearTempShapeLines();
      selectObject(null);
    }

    function clearTempShapeLines() {
      tempShapeLines.forEach(line => scene.remove(line));
      tempShapeLines = [];
    }

    function updateTempShapeLines(currentPos = null) {
      clearTempShapeLines();

      if (state.shapePoints.length < 1) return;

      const points = [...state.shapePoints];
      if (currentPos) points.push(currentPos);

      for (let i = 0; i < points.length - 1; i++) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(points[i].x, 0.3, points[i].y),
          new THREE.Vector3(points[i + 1].x, 0.3, points[i + 1].y)
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0x95d5b2 });
        const line = new THREE.Line(geometry, material);
        scene.add(line);
        tempShapeLines.push(line);
      }

      // Draw closing line preview
      if (points.length > 2 && currentPos) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(currentPos.x, 0.3, currentPos.y),
          new THREE.Vector3(points[0].x, 0.3, points[0].y)
        ]);
        const material = new THREE.LineDashedMaterial({
          color: 0x95d5b2,
          dashSize: 3,
          gapSize: 3
        });
        const line = new THREE.Line(geometry, material);
        line.computeLineDistances();
        scene.add(line);
        tempShapeLines.push(line);
      }
    }

    // ============================================
    // DRAG AND DROP FROM SYMBOL LIBRARY
    // ============================================

    function initDragAndDrop() {
      const symbols = document.querySelectorAll('.symbol-item');
      const dragPreview = document.getElementById('drag-preview');

      // Use mousedown/mousemove/mouseup for more reliable drag behavior
      symbols.forEach(symbol => {
        symbol.addEventListener('mousedown', (e) => {
          e.preventDefault();
          state.draggedSymbol = symbol.dataset.symbol;

          // Create preview
          dragPreview.innerHTML = symbol.innerHTML;
          dragPreview.style.display = 'block';
          dragPreview.style.left = `${e.clientX - 22}px`;
          dragPreview.style.top = `${e.clientY - 22}px`;
          dragPreview.style.width = '44px';
          dragPreview.style.height = '44px';
          dragPreview.style.background = 'var(--bg-tertiary)';
          dragPreview.style.border = '2px solid var(--accent)';
          dragPreview.style.borderRadius = '4px';
          dragPreview.style.display = 'flex';
          dragPreview.style.alignItems = 'center';
          dragPreview.style.justifyContent = 'center';

          // Add global listeners
          document.addEventListener('mousemove', onSymbolDrag);
          document.addEventListener('mouseup', onSymbolDrop);
        });
      });

      function onSymbolDrag(e) {
        if (state.draggedSymbol) {
          dragPreview.style.left = `${e.clientX - 22}px`;
          dragPreview.style.top = `${e.clientY - 22}px`;
        }
      }

      function onSymbolDrop(e) {
        document.removeEventListener('mousemove', onSymbolDrag);
        document.removeEventListener('mouseup', onSymbolDrop);

        dragPreview.style.display = 'none';

        if (state.draggedSymbol) {
          // Check if dropped on canvas
          const rect = renderer.domElement.getBoundingClientRect();
          if (e.clientX >= rect.left && e.clientX <= rect.right &&
              e.clientY >= rect.top && e.clientY <= rect.bottom) {
            const worldPos = screenToWorld(e.clientX, e.clientY);
            const snappedPos = snapPointToGrid(worldPos);
            createSymbolFromDrag(state.draggedSymbol, snappedPos);
          }
        }
        state.draggedSymbol = null;
      }
    }

    // ============================================
    // SYMBOL LIBRARY UI
    // ============================================

    // Toggle category dropdown
    function toggleCategory(header) {
      header.classList.toggle('open');
      const content = header.nextElementSibling;
      if (content) {
        content.classList.toggle('open');
      }
    }

    // Initialize library tabs
    function initLibraryTabs() {
      const tabs = document.querySelectorAll('.library-tab');
      const residentialContent = document.getElementById('tab-residential');
      const workshopContent = document.getElementById('tab-workshop');

      tabs.forEach(tab => {
        tab.addEventListener('click', () => {
          // Remove active from all tabs
          tabs.forEach(t => t.classList.remove('active'));
          // Add active to clicked tab
          tab.classList.add('active');

          // Show/hide content based on tab
          const tabType = tab.dataset.tab;
          if (tabType === 'residential') {
            residentialContent.style.display = 'block';
            workshopContent.style.display = 'none';
          } else if (tabType === 'workshop') {
            residentialContent.style.display = 'none';
            workshopContent.style.display = 'block';
          }
        });
      });
    }

    // ============================================
    // UI CONTROLS
    // ============================================

    function setTool(tool) {
      // Cancel any current pen tool operation first
      if (state.currentTool === 'wall') {
        cancelPenTool();
      }
      // Cancel any rectangle drawing
      if (state.currentTool === 'rect') {
        clearRectPreview();
        clearRectLabels();
        state.isDrawingRect = false;
        state.rectStart = null;
        state.rectEnd = null;
      }
      // Cancel any wire drawing
      if (state.currentTool === 'wire') {
        clearTempWireLine();
        state.isDrawingWire = false;
        state.wirePoints = [];
      }

      state.currentTool = tool;
      cancelCurrentAction();

      // Update UI
      document.querySelectorAll('#toolbar button[id^="tool-"]').forEach(btn => {
        btn.classList.remove('active');
      });
      document.getElementById(`tool-${tool}`).classList.add('active');

      // Update status
      const modeNames = {
        wall: 'Wall Drawing (Pen Tool)',
        rect: 'Rectangle Room (Click & Drag)',
        select: 'Select',
        dimension: 'Dimension',
        annotate: 'Annotate',
        shape: 'Shape Drawing',
        wire: 'Wire Drawing (Click to place points, Double-click to finish)'
      };
      document.getElementById('status-mode').textContent = modeNames[tool] || tool;
      renderer.domElement.style.cursor = (tool === 'wall' || tool === 'rect' || tool === 'wire') ? 'crosshair' : 'default';
    }

    function initUIControls() {
      // Theme toggle
      document.getElementById('theme-toggle').addEventListener('click', () => {
        state.theme = state.theme === 'dark' ? 'light' : 'dark';
        document.body.dataset.theme = state.theme;
        document.getElementById('theme-toggle').textContent = state.theme === 'dark' ? '☀️' : '🌙';
        scene.background = new THREE.Color(state.theme === 'dark' ? 0x0c0c0c : 0xf8f9fa);
        renderAll(); // Re-render to update colors
      });

      // View toggle
      document.getElementById('view-toggle').addEventListener('click', () => {
        if (state.currentView === '2d') {
          switchTo3D();
          document.getElementById('view-toggle').textContent = '3D';
        } else {
          switchTo2D();
          document.getElementById('view-toggle').textContent = '2D';
        }
      });

      // Tool buttons
      document.getElementById('tool-wall').addEventListener('click', () => setTool('wall'));
      document.getElementById('tool-rect').addEventListener('click', () => setTool('rect'));
      document.getElementById('tool-select').addEventListener('click', () => setTool('select'));
      document.getElementById('tool-dimension').addEventListener('click', () => setTool('dimension'));
      document.getElementById('tool-annotate').addEventListener('click', () => setTool('annotate'));
      document.getElementById('tool-shape').addEventListener('click', () => setTool('shape'));
      document.getElementById('tool-wire').addEventListener('click', () => setTool('wire'));

      // Grid size
      document.getElementById('grid-size').addEventListener('input', (e) => {
        state.gridSize = parseInt(e.target.value) || 0;
        createGrid();
      });

      // Undo/Redo
      document.getElementById('btn-undo').addEventListener('click', undo);
      document.getElementById('btn-redo').addEventListener('click', redo);

      // Save/Load
      document.getElementById('btn-save').addEventListener('click', saveProject);
      document.getElementById('btn-load').addEventListener('click', () => {
        document.getElementById('load-input').click();
      });
      document.getElementById('load-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          loadProject(e.target.files[0]);
          e.target.value = ''; // Reset for same file selection
        }
      });

      // Complete/Clear
      document.getElementById('btn-complete').addEventListener('click', () => {
        state.isComplete = true;
        document.getElementById('view-toggle').textContent = '3D';
        switchTo3D();
      });

      document.getElementById('btn-clear').addEventListener('click', () => {
        if (confirm('Clear all objects?')) {
          data.walls.forEach(w => w.remove());
          data.openings.forEach(o => o.remove());
          data.furniture.forEach(f => f.remove());
          data.dimensions.forEach(d => d.remove());
          data.annotations.forEach(a => a.remove());

          data.walls = [];
          data.openings = [];
          data.furniture = [];
          data.dimensions = [];
          data.annotations = [];

          saveHistory();
          updateStats();
        }
      });

      // Layer toggles
      document.querySelectorAll('.layer-item input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
          const layer = e.target.id.replace('layer-', '');
          state.layers[layer] = e.target.checked;
          renderAll();
        });
      });

      // Unit toggle
      document.querySelectorAll('input[name="unit"]').forEach(radio => {
        radio.addEventListener('change', (e) => {
          state.unit = e.target.value;
          renderAll();
        });
      });

      // Default values with sliders
      document.getElementById('default-height').addEventListener('input', (e) => {
        state.defaultWallHeight = parseInt(e.target.value) || 96;
        document.getElementById('default-height-value').textContent = `${state.defaultWallHeight}"`;
      });

      document.getElementById('default-thickness').addEventListener('input', (e) => {
        state.defaultWallThickness = parseInt(e.target.value) || 6;
        document.getElementById('default-thickness-value').textContent = `${state.defaultWallThickness}"`;
      });

      document.getElementById('simplify-tolerance').addEventListener('input', (e) => {
        state.simplifyTolerance = parseInt(e.target.value) || 8;
        document.getElementById('simplify-tolerance-value').textContent = state.simplifyTolerance;
      });

      // Delete selected
      document.getElementById('btn-delete-selected').addEventListener('click', deleteSelected);

      // Reference image import
      document.getElementById('btn-import-image').addEventListener('click', () => {
        document.getElementById('image-input').click();
      });

      document.getElementById('image-input').addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          loadReferenceImage(e.target.files[0]);
        }
      });

      document.getElementById('btn-set-scale').addEventListener('click', () => {
        startScaleCalibration();
      });

      document.getElementById('image-opacity').addEventListener('input', (e) => {
        const value = e.target.value;
        document.getElementById('image-opacity-value').textContent = `${value}%`;
        setReferenceOpacity(value / 100);
      });

      document.getElementById('btn-remove-image').addEventListener('click', () => {
        if (state.referenceImageMesh) {
          scene.remove(state.referenceImageMesh);
          state.referenceImageMesh = null;
          state.referenceImage = null;
          document.getElementById('image-settings').style.display = 'none';
          document.getElementById('btn-set-scale').disabled = true;
        }
      });

      // Property panel updates with sliders
      document.getElementById('prop-height').addEventListener('input', (e) => {
        const value = parseInt(e.target.value) || 96;
        document.getElementById('prop-height-value').textContent = `${value}"`;
        if (state.selectedObject instanceof Wall) {
          state.selectedObject.height = value;
          renderAll();
        }
      });

      document.getElementById('prop-height').addEventListener('change', () => {
        saveHistory();
      });

      document.getElementById('prop-thickness').addEventListener('input', (e) => {
        const value = parseInt(e.target.value) || 6;
        document.getElementById('prop-thickness-value').textContent = `${value}"`;
        if (state.selectedObject instanceof Wall) {
          state.selectedObject.thickness = value;
          renderAll();
        }
      });

      document.getElementById('prop-thickness').addEventListener('change', () => {
        saveHistory();
      });

      document.getElementById('prop-length').addEventListener('input', (e) => {
        const value = parseInt(e.target.value) || 120;
        document.getElementById('prop-length-value').textContent = formatMeasurement(value);
        if (state.selectedObject instanceof Wall) {
          // Scale wall length by moving the end point
          const wall = state.selectedObject;
          const currentLength = wall.length;
          if (currentLength > 0) {
            const scale = value / currentLength;
            const dx = wall.end.x - wall.start.x;
            const dy = wall.end.y - wall.start.y;
            wall.end.x = wall.start.x + dx * scale;
            wall.end.y = wall.start.y + dy * scale;
            renderAll();
          }
        }
      });

      document.getElementById('prop-length').addEventListener('change', () => {
        saveHistory();
      });

      // Furniture property event listeners
      document.getElementById('furn-width').addEventListener('input', (e) => {
        if (state.selectedObject instanceof Furniture) {
          state.selectedObject.width = parseInt(e.target.value) || 36;
          state.selectedObject.create2DMesh();
          state.selectedObject.create3DMesh();
          showFurnitureHandles(state.selectedObject);
        }
      });

      document.getElementById('furn-depth').addEventListener('input', (e) => {
        if (state.selectedObject instanceof Furniture) {
          state.selectedObject.depth = parseInt(e.target.value) || 36;
          state.selectedObject.create2DMesh();
          state.selectedObject.create3DMesh();
          showFurnitureHandles(state.selectedObject);
        }
      });

      document.getElementById('furn-height').addEventListener('input', (e) => {
        if (state.selectedObject instanceof Furniture) {
          state.selectedObject.height = parseInt(e.target.value) || 36;
          state.selectedObject.create3DMesh();
        }
      });

      document.getElementById('furn-rotation').addEventListener('input', (e) => {
        if (state.selectedObject instanceof Furniture) {
          const degrees = parseInt(e.target.value) || 0;
          state.selectedObject.rotation = degrees * Math.PI / 180;
          state.selectedObject.create2DMesh();
          state.selectedObject.create3DMesh();
          showFurnitureHandles(state.selectedObject);
        }
      });

      ['furn-width', 'furn-depth', 'furn-height', 'furn-rotation'].forEach(id => {
        document.getElementById(id).addEventListener('change', () => saveHistory());
      });

      document.getElementById('btn-delete-furniture').addEventListener('click', deleteSelected);

      // Hide help after 5 seconds
      setTimeout(() => {
        document.getElementById('help-tooltip').style.display = 'none';
      }, 8000);
    }

    // ============================================
    // WINDOW RESIZE
    // ============================================

    function onWindowResize() {
      const width = canvasArea.clientWidth;
      const height = canvasArea.clientHeight;

      if (camera.isOrthographicCamera) {
        const aspect = width / height;
        const frustumSize = 300;
        camera.left = -frustumSize * aspect / 2;
        camera.right = frustumSize * aspect / 2;
        camera.top = frustumSize / 2;
        camera.bottom = -frustumSize / 2;
      } else {
        camera.aspect = width / height;
      }

      camera.updateProjectionMatrix();
      renderer.setSize(width, height);
      updateLabelPositions();
      updateRulers();
    }

    // ============================================
    // SAVE / LOAD PROJECT
    // ============================================

    function saveProject() {
      const project = {
        version: '1.0',
        name: 'Floor Plan',
        created: new Date().toISOString(),
        settings: {
          defaultWallHeight: state.defaultWallHeight,
          defaultWallThickness: state.defaultWallThickness,
          gridSize: state.gridSize,
          unit: state.unit
        },
        walls: data.walls.map(w => ({
          start: { x: w.start.x, y: w.start.y },
          end: { x: w.end.x, y: w.end.y },
          thickness: w.thickness,
          height: w.height
        })),
        openings: data.openings.map(o => ({
          type: o.type,
          wallIndex: data.walls.indexOf(o.wall),
          position: o.position,
          width: o.width,
          height: o.height,
          sillHeight: o.sillHeight
        })),
        furniture: data.furniture.map(f => ({
          type: f.type,
          position: { x: f.position.x, y: f.position.y },
          width: f.width,
          depth: f.depth,
          height: f.height,
          rotation: f.rotation
        })),
        dimensions: data.dimensions.map(d => ({
          start: { x: d.start.x, y: d.start.y },
          end: { x: d.end.x, y: d.end.y }
        })),
        annotations: data.annotations.map(a => ({
          position: { x: a.position.x, y: a.position.y },
          text: a.text
        })),
        wires: data.wires.map(w => ({
          points: w.points.map(p => ({ x: p.x, y: p.y })),
          wireType: w.wireType
        }))
      };

      const json = JSON.stringify(project, null, 2);
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);

      const a = document.createElement('a');
      a.href = url;
      a.download = `floor-plan-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }

    function loadProject(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const project = JSON.parse(e.target.result);

          // Clear current data
          data.walls.forEach(w => w.remove());
          data.openings.forEach(o => o.remove());
          data.furniture.forEach(f => f.remove());
          data.dimensions.forEach(d => d.remove());
          data.annotations.forEach(a => a.remove());
          data.wires.forEach(w => w.remove());

          data.walls = [];
          data.openings = [];
          data.furniture = [];
          data.dimensions = [];
          data.annotations = [];
          data.wires = [];

          // Restore settings
          if (project.settings) {
            state.defaultWallHeight = project.settings.defaultWallHeight || 96;
            state.defaultWallThickness = project.settings.defaultWallThickness || 6;
            state.gridSize = project.settings.gridSize || 6;
            state.unit = project.settings.unit || 'in';

            document.getElementById('default-height').value = state.defaultWallHeight;
            document.getElementById('default-height-value').textContent = `${state.defaultWallHeight}"`;
            document.getElementById('default-thickness').value = state.defaultWallThickness;
            document.getElementById('default-thickness-value').textContent = `${state.defaultWallThickness}"`;
            document.getElementById('grid-size').value = state.gridSize;
            document.querySelector(`input[name="unit"][value="${state.unit}"]`).checked = true;
          }

          // Restore walls
          if (project.walls) {
            project.walls.forEach(w => {
              const wall = new Wall(w.start, w.end, w.thickness, w.height);
              data.walls.push(wall);
            });
          }

          // Restore openings
          if (project.openings) {
            project.openings.forEach(o => {
              if (o.wallIndex >= 0 && o.wallIndex < data.walls.length) {
                const wall = data.walls[o.wallIndex];
                const opening = new Opening(o.type, wall, o.position, o.width, o.height, o.sillHeight);
                data.openings.push(opening);
                wall.openings.push(opening);
              }
            });
          }

          // Restore furniture
          if (project.furniture) {
            project.furniture.forEach(f => {
              const furniture = new Furniture(f.type, f.position, f.width, f.depth, f.height);
              furniture.rotation = f.rotation || 0;
              data.furniture.push(furniture);
            });
          }

          // Restore dimensions
          if (project.dimensions) {
            project.dimensions.forEach(d => {
              const dim = new Dimension(d.start, d.end);
              data.dimensions.push(dim);
            });
          }

          // Restore annotations
          if (project.annotations) {
            project.annotations.forEach(a => {
              const ann = new Annotation(a.position, a.text);
              data.annotations.push(ann);
            });
          }

          // Restore wires
          if (project.wires) {
            project.wires.forEach(w => {
              const wire = new Wire(w.points, w.wireType);
              data.wires.push(wire);
            });
          }

          createGrid();
          renderAll();
          saveHistory();

          alert(`Project loaded successfully!\nWalls: ${data.walls.length}, Furniture: ${data.furniture.length}`);
        } catch (err) {
          alert('Error loading project: ' + err.message);
          console.error(err);
        }
      };
      reader.readAsText(file);
    }

    // ============================================
    // REFERENCE IMAGE HANDLING
    // ============================================

    let scaleLinePreview = null;

    function loadReferenceImage(file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          // Remove existing reference image
          if (state.referenceImageMesh) {
            scene.remove(state.referenceImageMesh);
          }

          // Create texture from image
          const texture = new THREE.Texture(img);
          texture.needsUpdate = true;

          // Calculate aspect ratio and size
          const aspectRatio = img.width / img.height;
          const planeHeight = 400; // Default size in world units
          const planeWidth = planeHeight * aspectRatio;

          const geometry = new THREE.PlaneGeometry(planeWidth, planeHeight);
          const material = new THREE.MeshBasicMaterial({
            map: texture,
            transparent: true,
            opacity: state.referenceOpacity,
            side: THREE.DoubleSide
          });

          state.referenceImageMesh = new THREE.Mesh(geometry, material);
          state.referenceImageMesh.rotation.x = -Math.PI / 2;
          state.referenceImageMesh.position.y = -0.2; // Slightly below grid

          scene.add(state.referenceImageMesh);

          // Store image info
          state.referenceImage = {
            width: img.width,
            height: img.height,
            worldWidth: planeWidth,
            worldHeight: planeHeight
          };

          // Enable scale button and show settings
          document.getElementById('btn-set-scale').disabled = false;
          document.getElementById('image-settings').style.display = 'block';
          document.getElementById('image-opacity').value = state.referenceOpacity * 100;

          alert('Image loaded! Click "Set Scale" to calibrate by marking a known distance.');
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    }

    function startScaleCalibration() {
      state.settingScale = true;
      state.scalePoint1 = null;
      state.scalePoint2 = null;

      document.getElementById('status-mode').textContent = 'Scale Calibration: Click first point of known distance';

      // Temporarily switch to a calibration mode
      if (scaleLinePreview) {
        scene.remove(scaleLinePreview);
        scaleLinePreview = null;
      }
    }

    function handleScaleClick(worldPos) {
      if (!state.scalePoint1) {
        state.scalePoint1 = { ...worldPos };
        document.getElementById('status-mode').textContent = 'Scale Calibration: Click second point';
      } else if (!state.scalePoint2) {
        state.scalePoint2 = { ...worldPos };

        // Draw the scale line
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(state.scalePoint1.x, 0.5, state.scalePoint1.y),
          new THREE.Vector3(state.scalePoint2.x, 0.5, state.scalePoint2.y)
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000, linewidth: 2 });
        scaleLinePreview = new THREE.Line(geometry, material);
        scene.add(scaleLinePreview);

        // Calculate pixel distance
        const pixelDist = calculateDistance(state.scalePoint1, state.scalePoint2);

        // Ask for real-world measurement
        const realMeasurement = prompt(
          `You marked a distance of ${pixelDist.toFixed(1)} units.\n\nEnter the real-world measurement this represents (in inches):`,
          '120'
        );

        if (realMeasurement && !isNaN(parseFloat(realMeasurement))) {
          const realInches = parseFloat(realMeasurement);
          const scaleFactor = realInches / pixelDist;

          // Resize the reference image based on scale
          if (state.referenceImageMesh && state.referenceImage) {
            const newWidth = state.referenceImage.worldWidth * scaleFactor;
            const newHeight = state.referenceImage.worldHeight * scaleFactor;

            state.referenceImageMesh.scale.set(scaleFactor, scaleFactor, 1);

            state.pixelsPerInch = 1 / scaleFactor;

            alert(`Scale set! The image has been resized to match real-world dimensions.\n1 unit = 1 inch`);
          }
        }

        // Clean up
        if (scaleLinePreview) {
          scene.remove(scaleLinePreview);
          scaleLinePreview = null;
        }

        state.settingScale = false;
        state.scalePoint1 = null;
        state.scalePoint2 = null;

        document.getElementById('status-mode').textContent = 'Wall Drawing (Pen Tool)';
      }
    }

    function updateScalePreviewLine(worldPos) {
      if (scaleLinePreview) {
        scene.remove(scaleLinePreview);
      }

      if (state.scalePoint1) {
        const geometry = new THREE.BufferGeometry().setFromPoints([
          new THREE.Vector3(state.scalePoint1.x, 0.5, state.scalePoint1.y),
          new THREE.Vector3(worldPos.x, 0.5, worldPos.y)
        ]);
        const material = new THREE.LineBasicMaterial({ color: 0xff0000 });
        scaleLinePreview = new THREE.Line(geometry, material);
        scene.add(scaleLinePreview);

        // Show distance
        const dist = calculateDistance(state.scalePoint1, worldPos);
        document.getElementById('status-length').textContent = `${dist.toFixed(1)} units`;
      }
    }

    function setReferenceOpacity(opacity) {
      state.referenceOpacity = opacity;
      if (state.referenceImageMesh) {
        state.referenceImageMesh.material.opacity = opacity;
      }
    }

    // ============================================
    // PANEL RESIZE
    // ============================================

    function initPanelResize() {
      const resizeHandles = document.querySelectorAll('.resize-handle');
      let isResizing = false;
      let currentPanel = null;
      let startX = 0;
      let startWidth = 0;

      resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', (e) => {
          e.preventDefault();
          e.stopPropagation();
          isResizing = true;
          const panelId = handle.dataset.resize;
          currentPanel = document.getElementById(panelId);
          startX = e.clientX;
          startWidth = currentPanel.offsetWidth;
          document.body.style.cursor = 'ew-resize';
          document.body.style.userSelect = 'none';
        });
      });

      document.addEventListener('mousemove', (e) => {
        if (!isResizing || !currentPanel) return;

        const panelId = currentPanel.id;
        let delta = e.clientX - startX;

        // For left panels, positive delta means wider
        // For right panels (properties-panel), negative delta means wider
        if (panelId === 'properties-panel') {
          delta = -delta;
        }

        const newWidth = Math.max(150, Math.min(400, startWidth + delta));
        currentPanel.style.width = newWidth + 'px';

        // Trigger resize to update canvas
        onWindowResize();
      });

      document.addEventListener('mouseup', () => {
        if (isResizing) {
          isResizing = false;
          currentPanel = null;
          document.body.style.cursor = '';
          document.body.style.userSelect = '';
        }
      });
    }

    // ============================================
    // INITIALIZATION
    // ============================================

    function init() {
      initThreeJS();
      initUIControls();
      initDragAndDrop();
      initLibraryTabs();
      initPanelResize();

      // Event listeners
      renderer.domElement.addEventListener('mousedown', onMouseDown);
      renderer.domElement.addEventListener('mousemove', onMouseMove);
      renderer.domElement.addEventListener('mouseup', onMouseUp);
      renderer.domElement.addEventListener('dblclick', onDoubleClick);
      renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
      renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('resize', onWindowResize);

      // Catch mouse up events that happen outside the canvas to reset drag states
      window.addEventListener('mouseup', () => {
        panState.isPanning = false;
        orbitState.isPanning = false;
        orbitState.isDragging = false;
        state.isDragging = false;
        state.draggingWallPoint = false;
        state.draggingFurnitureHandle = false;
        state.isMarqueeSelecting = false;
      });

      // Initial rulers
      setTimeout(updateRulers, 100);

      // Initial history state
      saveHistory();

      console.log('Floor Plan Editor initialized');
    }

    // Start the application
    init();
