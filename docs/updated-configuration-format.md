# Juicebox Configuration Format

This document describes the updated configuration format for Juicebox sessions, with a focus on the simplified color scale system introduced in the refactoring.

## Overview

The Juicebox configuration format is a JSON object that specifies maps, display settings, color scales, and visualization state. This document uses the `enhanced_config` example from `src/main.js` to illustrate the current recommended format.

## Complete Configuration Example

```javascript
{
    // Map URLs
    "url": "https://hicfiles.s3.amazonaws.com/hiseq/imr90/in-situ/combined.hic",
    "name": "Contact Map (Combined)",
    "controlUrl": "https://s3.amazonaws.com/hicfiles/hiseq/degron/untreated/unsynchronized/HIC005.hic",
    "controlName": "Control Map (Untreated, HIC005)",
    
    // Normalization vector indices
    "nvi": "13433880319,35723",
    "controlNvi": "6846576837,36479",
    
    // State (chromosome, locus, zoom, etc.)
    "state": "7,7,5,815.66029,815.66029,640,640,1,NONE",
    
    // Color scale - Single foreground color scale used for BOTH A and B modes
    "colorScale": "2000,255,0,0",
    
    // Background color - Single background color shared across ALL modes
    "backgroundColor": "255,255,255",
    
    // Ratio color scale - Used for AOB/BOA ratio modes
    "ratioColorScale": "R:5:1.6094379124341003,255,0,0:1.6094379124341003,0,0,255",
    
    // Initial display mode
    "displayMode": "A",
    
    // Optional: Gene selection
    "selectedGene": "egfr"
}
```

## Configuration Fields

### Map Configuration

#### `url` (required)
- **Type**: String (URL)
- **Description**: URL to the main Hi-C contact map (.hic file)
- **Example**: `"https://hicfiles.s3.amazonaws.com/hiseq/imr90/in-situ/combined.hic"`

#### `name` (optional)
- **Type**: String
- **Description**: Display name for the contact map
- **Example**: `"Contact Map (Combined)"`

#### `controlUrl` (optional)
- **Type**: String (URL)
- **Description**: URL to the control/comparison Hi-C map (.hic file). Required for ratio modes (AOB/BOA) and difference mode (AMB).
- **Example**: `"https://s3.amazonaws.com/hicfiles/hiseq/degron/untreated/unsynchronized/HIC005.hic"`

#### `controlName` (optional)
- **Type**: String
- **Description**: Display name for the control map
- **Example**: `"Control Map (Untreated, HIC005)"`

### Normalization Configuration

#### `nvi` (optional)
- **Type**: String
- **Description**: Normalization vector indices for the contact map
- **Format**: `"index1,index2"`
- **Example**: `"13433880319,35723"`

#### `controlNvi` (optional)
- **Type**: String
- **Description**: Normalization vector indices for the control map
- **Format**: `"index1,index2"`
- **Example**: `"6846576837,36479"`

### Visualization State

#### `state` (optional)
- **Type**: String
- **Description**: Encoded visualization state including chromosome, locus, zoom level, and normalization
- **Format**: `"chr1,chr2,zoom,x,y,pixelSizeX,pixelSizeY,normalizationIndex,normalization"`
- **Example**: `"7,7,5,815.66029,815.66029,640,640,1,NONE"`

### Color Scale Configuration

The color scale system has been simplified to use a single foreground color scale for individual map display (A/B modes) and a separate ratio color scale for ratio comparisons (AOB/BOA modes).

#### `colorScale` (optional)
- **Type**: String
- **Description**: Single foreground color scale used for **both** Contact Map (A) and Control Map (B) display modes
- **Format**: `"threshold,r,g,b"`
  - `threshold`: Numeric threshold value for the color scale
  - `r`, `g`, `b`: Red, green, blue values (0-255)
- **Example**: `"2000,255,0,0"` (threshold 2000, red color)
- **Note**: This color scale is shared between A and B modes. When you change the foreground color in either mode, it affects both.

#### `backgroundColor` (optional)
- **Type**: String
- **Description**: Single background color shared across **all** display modes (A, B, AOB, BOA, AMB)
- **Format**: `"r,g,b"`
  - `r`, `g`, `b`: Red, green, blue values (0-255)
- **Example**: `"255,255,255"` (white background)
- **Note**: This background color is used consistently across all display modes.

#### `ratioColorScale` (optional)
- **Type**: String
- **Description**: Color scale used for ratio display modes (AOB/BOA). Only relevant when `controlUrl` is present.
- **Format**: `"R:threshold:positiveScale:negativeScale"`
  - `threshold`: Ratio threshold (e.g., 5 means ratios > 5 are positive, ratios < 1/5 are negative)
  - `positiveScale`: `"logThreshold,r,g,b"` for positive ratios (ratios > threshold, enriched regions)
  - `negativeScale`: `"logThreshold,r,g,b"` for negative ratios (ratios < 1/threshold, depleted regions)
- **Example**: `"R:5:1.6094379124341003,255,0,0:1.6094379124341003,0,0,255"`
  - Threshold: 5
  - Positive ratios (> 5): Red (255,0,0) - indicates enrichment
  - Negative ratios (< 0.2): Blue (0,0,255) - indicates depletion
- **Default**: If not specified, defaults are used (threshold=5, positive=red, negative=blue)
- **Note**: This is automatically saved when users adjust ratio colors via the UI color picker.

### Display Mode

#### `displayMode` (optional)
- **Type**: String
- **Description**: Initial display mode for the visualization
- **Options**:
  - `"A"`: Contact Map (main/primary dataset)
  - `"B"`: Control Map (secondary/comparison dataset)
  - `"AOB"`: Ratio mode showing Contact Map / Control Map
  - `"BOA"`: Ratio mode showing Control Map / Contact Map
  - `"AMB"`: Difference mode (Contact Map - Control Map)
- **Default**: `"A"` (Contact Map)
- **Note**: Ratio modes (AOB/BOA) and difference mode (AMB) require `controlUrl` to be set.

### Gene Selection

#### `selectedGene` (optional)
- **Type**: String
- **Description**: Name of the gene to highlight/select
- **Example**: `"egfr"`

## Color Scale Model Summary

The refactored color scale system follows this simplified model:

1. **Single Foreground Color Scale** (`colorScale`):
   - Used for both A (Contact Map) and B (Control Map) modes
   - Format: `"threshold,r,g,b"`
   - When you change the foreground color in either A or B mode, it affects both

2. **Single Background Color** (`backgroundColor`):
   - Shared across all display modes (A, B, AOB, BOA, AMB)
   - Format: `"r,g,b"`
   - Consistent background regardless of display mode

3. **Separate Ratio Color Scale** (`ratioColorScale`):
   - Used exclusively for AOB/BOA ratio modes
   - Has distinct positive (enrichment) and negative (depletion) color components
   - Format: `"R:threshold:positiveScale:negativeScale"`
   - Colors are distinct from the single foreground color scale used for A/B modes

## Display Mode Terminology

To avoid confusion, it's important to understand the mapping between display modes and datasets:

- **Display Mode A** = **Contact Map** (main/primary dataset, `browser.dataset`)
- **Display Mode B** = **Control Map** (secondary/comparison dataset, `browser.controlDataset`)
- **Display Mode AOB** = Ratio of Contact Map / Control Map
- **Display Mode BOA** = Ratio of Control Map / Contact Map
- **Display Mode AMB** = Difference (Contact Map - Control Map)

## Session Format

When saving sessions (via `hicBrowser.toJSON()`), the configuration is saved in a `browsers` array:

```json
{
  "browsers": [
    {
      "url": "...",
      "name": "...",
      "controlUrl": "...",
      "controlName": "...",
      "colorScale": "2000,255,0,0",
      "backgroundColor": "255,255,255",
      "ratioColorScale": "R:5:1.6094379124341003,255,0,0:1.6094379124341003,0,0,255",
      "displayMode": "A",
      "state": "...",
      "nvi": "...",
      "controlNvi": "...",
      "selectedGene": "..."
    }
  ],
  "selectedGene": "..."
}
```

## Backward Compatibility

The configuration format maintains backward compatibility with legacy formats. If `ratioColorScale` is not specified, default values are used. The single `colorScale` field works for both A and B modes, simplifying configuration compared to previous versions that required separate scales.

## Related Documentation

- See `docs/COLOR_SCALE_REFACTORING.md` for details on the refactoring that introduced this simplified model
- See `src/main.js` for the `enhanced_config` example used as the basis for this documentation

