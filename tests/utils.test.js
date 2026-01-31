/**
 * Unit tests for utility functions
 */

import { describe, it, expect, vi } from 'vitest';

// Mock utility functions that would be extracted from floor-plan-editor.html
// In a real scenario, these would be imported from a separate module

describe('Utility Functions', () => {
  describe('calculateDistance', () => {
    // Simulating the calculateDistance function from the app
    const calculateDistance = (p1, p2) => {
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      return Math.sqrt(dx * dx + dy * dy);
    };

    it('should calculate distance between two points', () => {
      const p1 = { x: 0, y: 0 };
      const p2 = { x: 3, y: 4 };
      expect(calculateDistance(p1, p2)).toBe(5);
    });

    it('should return 0 for same point', () => {
      const p = { x: 10, y: 20 };
      expect(calculateDistance(p, p)).toBe(0);
    });

    it('should handle negative coordinates', () => {
      const p1 = { x: -3, y: -4 };
      const p2 = { x: 0, y: 0 };
      expect(calculateDistance(p1, p2)).toBe(5);
    });
  });

  describe('snapToGrid', () => {
    const snapToGrid = (value, gridSize) => {
      if (gridSize <= 0) return value;
      return Math.round(value / gridSize) * gridSize;
    };

    it('should snap to nearest grid point', () => {
      expect(snapToGrid(7, 6)).toBe(6);
      expect(snapToGrid(10, 6)).toBe(12);
      expect(snapToGrid(3, 6)).toBe(6);
    });

    it('should return original value when gridSize is 0', () => {
      expect(snapToGrid(7.5, 0)).toBe(7.5);
    });

    it('should handle exact grid values', () => {
      expect(snapToGrid(12, 6)).toBe(12);
    });
  });

  describe('formatMeasurement', () => {
    const formatMeasurement = (inches, unit = 'in') => {
      if (unit === 'ft') {
        const feet = Math.floor(inches / 12);
        const remainingInches = Math.round(inches % 12);
        if (remainingInches === 0) return `${feet}'`;
        return `${feet}' ${remainingInches}"`;
      }
      return `${Math.round(inches)}"`;
    };

    it('should format inches correctly', () => {
      expect(formatMeasurement(36, 'in')).toBe('36"');
    });

    it('should format feet and inches correctly', () => {
      expect(formatMeasurement(36, 'ft')).toBe("3'");
      expect(formatMeasurement(38, 'ft')).toBe("3' 2\"");
    });

    it('should round to nearest inch', () => {
      expect(formatMeasurement(36.7, 'in')).toBe('37"');
    });
  });
});

describe('Geometry Calculations', () => {
  describe('Wall angle calculation', () => {
    const calculateAngle = (start, end) => {
      return Math.atan2(end.y - start.y, end.x - start.x);
    };

    it('should calculate horizontal angle', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 10, y: 0 };
      expect(calculateAngle(start, end)).toBe(0);
    });

    it('should calculate vertical angle', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 0, y: 10 };
      expect(calculateAngle(start, end)).toBeCloseTo(Math.PI / 2);
    });

    it('should calculate 45 degree angle', () => {
      const start = { x: 0, y: 0 };
      const end = { x: 10, y: 10 };
      expect(calculateAngle(start, end)).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('Point to line distance', () => {
    const pointToLineDistance = (point, lineStart, lineEnd) => {
      const dx = lineEnd.x - lineStart.x;
      const dy = lineEnd.y - lineStart.y;
      const lengthSq = dx * dx + dy * dy;

      if (lengthSq === 0) {
        const pdx = point.x - lineStart.x;
        const pdy = point.y - lineStart.y;
        return Math.sqrt(pdx * pdx + pdy * pdy);
      }

      let t = ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lengthSq;
      t = Math.max(0, Math.min(1, t));

      const projX = lineStart.x + t * dx;
      const projY = lineStart.y + t * dy;

      const distX = point.x - projX;
      const distY = point.y - projY;
      return Math.sqrt(distX * distX + distY * distY);
    };

    it('should calculate perpendicular distance', () => {
      const point = { x: 5, y: 5 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 0 };
      expect(pointToLineDistance(point, lineStart, lineEnd)).toBe(5);
    });

    it('should return 0 for point on line', () => {
      const point = { x: 5, y: 0 };
      const lineStart = { x: 0, y: 0 };
      const lineEnd = { x: 10, y: 0 };
      expect(pointToLineDistance(point, lineStart, lineEnd)).toBe(0);
    });
  });
});
