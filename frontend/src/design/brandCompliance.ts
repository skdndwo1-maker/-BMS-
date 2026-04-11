import type { ComplianceIssue } from "./types";
import { brandColors } from "./brandSystem";

export function checkBrandCompliance(
  content: {
    title: string;
    subtitle: string;
    bodyText: string;
    image?: File | string;
  },
  usedColors: string[] = [],
  _usedFonts: string[] = []
): ComplianceIssue[] {
  const issues: ComplianceIssue[] = [];

  // Check if colors match brand palette
  const allowedColors = Object.values(brandColors);
  usedColors.forEach((color) => {
    if (!allowedColors.includes(color.toUpperCase()) && !allowedColors.includes(color.toLowerCase())) {
      issues.push({
        type: 'color',
        severity: 'error',
        message: `Color ${color} is not in the brand palette`,
      });
    }
  });

  // Check text content length for optimal layout
  if (content.title.length > 50) {
    issues.push({
      type: 'spacing',
      severity: 'warning',
      message: 'Title is quite long. Consider shortening for better readability.',
      location: 'title',
    });
  }

  if (content.subtitle.length > 80) {
    issues.push({
      type: 'spacing',
      severity: 'warning',
      message: 'Subtitle is quite long. May affect layout balance.',
      location: 'subtitle',
    });
  }

  if (content.bodyText.length > 300) {
    issues.push({
      type: 'spacing',
      severity: 'warning',
      message: 'Body text is lengthy. Consider condensing key points.',
      location: 'bodyText',
    });
  }

  // Check for missing content
  if (!content.title.trim()) {
    issues.push({
      type: 'spacing',
      severity: 'error',
      message: 'Title is required for brand consistency',
      location: 'title',
    });
  }

  return issues;
}

export function calculateTextSize(
  text: string,
  baseSize: number,
  _maxWidth: number,
  containerWidth: number
): number {
  // Auto-resize text to fit container
  const charCount = text.length;
  const avgCharWidth = baseSize * 0.6; // Approximate character width
  const estimatedWidth = charCount * avgCharWidth;
  
  if (estimatedWidth > containerWidth) {
    const scaleFactor = containerWidth / estimatedWidth;
    return Math.max(baseSize * scaleFactor, baseSize * 0.6); // Don't go below 60% of base size
  }
  
  return baseSize;
}

export function getContrastRatio(color1: string, color2: string): number {
  // Simplified contrast calculation
  // In production, use a proper WCAG contrast calculation
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');
  
  const r1 = parseInt(hex1.substr(0, 2), 16);
  const g1 = parseInt(hex1.substr(2, 2), 16);
  const b1 = parseInt(hex1.substr(4, 2), 16);
  
  const r2 = parseInt(hex2.substr(0, 2), 16);
  const g2 = parseInt(hex2.substr(2, 2), 16);
  const b2 = parseInt(hex2.substr(4, 2), 16);
  
  const l1 = 0.299 * r1 + 0.587 * g1 + 0.114 * b1;
  const l2 = 0.299 * r2 + 0.587 * g2 + 0.114 * b2;
  
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  
  return (lighter + 0.05) / (darker + 0.05);
}

export function validateImageResolution(
  file: File,
  minWidth: number,
  minHeight: number
): Promise<ComplianceIssue | null> {
  return new Promise((resolve) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    
    img.onload = () => {
      URL.revokeObjectURL(url);
      
      if (img.width < minWidth || img.height < minHeight) {
        resolve({
          type: 'resolution',
          severity: 'warning',
          message: `Image resolution is ${img.width}x${img.height}. Recommended: ${minWidth}x${minHeight} or higher for print quality.`,
        });
      } else {
        resolve(null);
      }
    };
    
    img.onerror = () => {
      URL.revokeObjectURL(url);
      resolve({
        type: 'resolution',
        severity: 'error',
        message: 'Unable to load image file',
      });
    };
    
    img.src = url;
  });
}
