/**
 * Vitest test setup file
 * Configures global test environment
 */

import { beforeAll, afterAll, afterEach } from 'vitest';

// Mock Three.js since tests run in Node environment
global.THREE = {
  Scene: class {},
  WebGLRenderer: class {
    constructor() {
      this.domElement = { style: {} };
    }
    setSize() {}
    render() {}
  },
  PerspectiveCamera: class {},
  OrthographicCamera: class {},
  Vector3: class {
    constructor(x = 0, y = 0, z = 0) {
      this.x = x;
      this.y = y;
      this.z = z;
    }
    set() { return this; }
    normalize() { return this; }
    cross() { return this; }
  },
  Group: class {
    constructor() {
      this.children = [];
      this.position = { x: 0, y: 0, z: 0, set() {} };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.userData = {};
    }
    add(child) { this.children.push(child); }
    remove() {}
    traverse(fn) { fn(this); }
  },
  Mesh: class {
    constructor() {
      this.position = { x: 0, y: 0, z: 0, set() {} };
      this.rotation = { x: 0, y: 0, z: 0 };
      this.userData = {};
    }
  },
  BoxGeometry: class {},
  PlaneGeometry: class {},
  CircleGeometry: class {},
  CylinderGeometry: class {},
  SphereGeometry: class {},
  ExtrudeGeometry: class {
    rotateX() {}
  },
  BufferGeometry: class {
    setFromPoints() { return this; }
  },
  EdgesGeometry: class {},
  Shape: class {
    constructor() {
      this.holes = [];
    }
    moveTo() {}
    lineTo() {}
  },
  Path: class {
    moveTo() {}
    lineTo() {}
  },
  MeshBasicMaterial: class {},
  MeshStandardMaterial: class {},
  LineBasicMaterial: class {},
  LineDashedMaterial: class {},
  Line: class {
    constructor() {
      this.position = { x: 0, y: 0, z: 0 };
      this.children = [];
      this.userData = {};
    }
    computeLineDistances() {}
    add() {}
  },
  LineSegments: class {},
  Color: class {},
  Raycaster: class {
    setFromCamera() {}
    intersectObjects() { return []; }
  },
  Vector2: class {
    constructor(x = 0, y = 0) {
      this.x = x;
      this.y = y;
    }
  },
  DoubleSide: 2,
  AmbientLight: class {},
  DirectionalLight: class {
    constructor() {
      this.position = { set() {} };
    }
  },
  GridHelper: class {},
  RingGeometry: class {}
};

// Setup before all tests
beforeAll(() => {
  // Create mock DOM elements
  document.body.innerHTML = `
    <div id="canvas-container"></div>
    <div id="labels-container"></div>
    <div id="status-mode"></div>
    <div id="status-mouse"></div>
    <input id="grid-size" value="6" />
    <select id="wire-type"><option value="electrical">Electrical</option></select>
  `;
});

// Cleanup after each test
afterEach(() => {
  // Reset any global state if needed
});

// Cleanup after all tests
afterAll(() => {
  document.body.innerHTML = '';
});
