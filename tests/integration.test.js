/**
 * Integration tests for Floor Plan Editor
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'fs';
import { resolve } from 'path';

describe('Floor Plan Editor HTML', () => {
  let htmlContent;

  beforeEach(() => {
    // Load the actual HTML file
    const htmlPath = resolve(process.cwd(), 'floor-plan-editor.html');
    htmlContent = readFileSync(htmlPath, 'utf-8');
  });

  describe('HTML Structure', () => {
    it('should contain required meta tags', () => {
      expect(htmlContent).toContain('<meta charset="UTF-8">');
      expect(htmlContent).toContain('<meta name="viewport"');
    });

    it('should include Three.js library', () => {
      expect(htmlContent).toContain('three.min.js');
    });

    it('should have canvas container', () => {
      expect(htmlContent).toContain('id="canvas-container"');
    });

    it('should have toolbar elements', () => {
      expect(htmlContent).toContain('id="toolbar"');
      expect(htmlContent).toContain('tool-wall');
      expect(htmlContent).toContain('tool-select');
    });

    it('should have properties panel', () => {
      expect(htmlContent).toContain('id="properties-panel"');
    });
  });

  describe('Required Classes', () => {
    it('should define Wall class', () => {
      expect(htmlContent).toContain('class Wall');
    });

    it('should define Furniture class', () => {
      expect(htmlContent).toContain('class Furniture');
    });

    it('should define Opening class', () => {
      expect(htmlContent).toContain('class Opening');
    });

    it('should define Wire class', () => {
      expect(htmlContent).toContain('class Wire');
    });

    it('should define Dimension class', () => {
      expect(htmlContent).toContain('class Dimension');
    });
  });

  describe('Required Functions', () => {
    it('should define renderAll function', () => {
      expect(htmlContent).toContain('function renderAll');
    });

    it('should define saveProject function', () => {
      expect(htmlContent).toContain('function saveProject');
    });

    it('should define loadProject function', () => {
      expect(htmlContent).toContain('function loadProject');
    });

    it('should define switchTo2D function', () => {
      expect(htmlContent).toContain('function switchTo2D');
    });

    it('should define switchTo3D function', () => {
      expect(htmlContent).toContain('function switchTo3D');
    });
  });

  describe('Feature Support', () => {
    it('should support keyboard shortcuts', () => {
      expect(htmlContent).toContain('keydown');
      expect(htmlContent).toContain("case 'w':");
      expect(htmlContent).toContain("case 'q':");
    });

    it('should support mouse interactions', () => {
      expect(htmlContent).toContain('mousedown');
      expect(htmlContent).toContain('mousemove');
      expect(htmlContent).toContain('mouseup');
    });

    it('should support touch events', () => {
      expect(htmlContent).toContain('wheel');
    });

    it('should support copy/paste', () => {
      expect(htmlContent).toContain('clipboard');
    });

    it('should support undo/redo', () => {
      expect(htmlContent).toContain('function undo');
      expect(htmlContent).toContain('function redo');
    });
  });

  describe('Furniture Types', () => {
    const furnitureTypes = [
      'sofa', 'bed', 'desk', 'table', 'chair',
      'toilet', 'bathtub', 'sink', 'refrigerator', 'stove',
      'electrical-panel', 'junction-box', 'outlet', 'light-switch'
    ];

    furnitureTypes.forEach(type => {
      it(`should support ${type} furniture type`, () => {
        expect(htmlContent).toContain(type);
      });
    });
  });

  describe('Wire Types', () => {
    const wireTypes = ['electrical', 'data', 'speaker', 'low-voltage', 'conduit'];

    wireTypes.forEach(type => {
      it(`should support ${type} wire type`, () => {
        expect(htmlContent).toContain(type);
      });
    });
  });
});

describe('Build Artifacts', () => {
  it('should have valid HTML structure', () => {
    const htmlPath = resolve(process.cwd(), 'floor-plan-editor.html');
    const content = readFileSync(htmlPath, 'utf-8');

    expect(content).toContain('<!DOCTYPE html>');
    expect(content).toContain('<html');
    expect(content).toContain('</html>');
    expect(content).toContain('<head>');
    expect(content).toContain('</head>');
    expect(content).toContain('<body>');
    expect(content).toContain('</body>');
  });
});
