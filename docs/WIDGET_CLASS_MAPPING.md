# Juicebox.js Widget-to-Class Mapping

This document maps the visible UI widgets in the Juicebox.js browser interface to their corresponding JavaScript classes that handle user interactions.

## Navigation Bar (Top Section)

The navigation bar is divided into two widget container rows: `upper-hic-nav-bar-widget-container` and `lower-hic-nav-bar-widget-container`.

### Upper Navigation Bar Widgets

1. **Locus Goto Input Field**
   - **CSS Class**: `hic-chromosome-goto-container`
   - **JavaScript Class**: `LocusGoto` (`js/hicLocusGoto.js`)
   - **Location**: Upper navbar widget container
   - **Functionality**: Text input field for navigating to specific genomic loci (e.g., "chr1:1000-2000 chr2:3000-4000")
   - **Key Element**: `input[type="text"]` with placeholder "chr-x-axis chr-y-axis"

2. **Resolution Selector Dropdown**
   - **CSS Class**: `hic-resolution-selector-container`
   - **JavaScript Class**: `ResolutionSelector` (`js/hicResolutionSelector.js`)
   - **Location**: Upper navbar widget container
   - **Functionality**: Dropdown to select matrix resolution (kb/mb) with lock/unlock icon
   - **Key Elements**: 
     - Lock/unlock icon (`#hic-resolution-lock`) - toggles `fa-lock`/`fa-unlock`
     - Label (`#hic-resolution-label-container`) - shows "Resolution (kb)" or "Resolution (mb)"
     - Select dropdown (`select[name="resolution_selector"]`)

### Lower Navigation Bar Widgets

3. **Color Scale Widget**
   - **CSS Class**: `hic-colorscale-widget-container`
   - **JavaScript Class**: `ColorScaleWidget` (`js/hicColorScaleWidget.js`)
   - **Location**: Lower navbar widget container
   - **Functionality**: Controls color scale threshold and colors for the contact matrix
   - **Key Elements**:
     - Background color swatch (map background color picker)
     - Minus button (for ratio/negative scale, hidden in standard mode)
     - Plus button (for positive scale)
     - Color scale input field (`input[type="text"]`)
     - Plus/minus icon buttons (`fa-plus`, `fa-minus`) for threshold adjustment

4. **Control Map Widget**
   - **CSS Class**: `hic-control-map-selector-container`
   - **JavaScript Class**: `ControlMapWidget` (`js/controlMapWidget.js`)
   - **Location**: Lower navbar widget container
   - **Functionality**: Selector for control map display mode (A, B, A/B, B/A) when control dataset is loaded
   - **Key Elements**:
     - Select dropdown (`select[name="control_map_selector"]`)
     - Toggle arrows (up/down SVG icons)
     - Cycle button (circular arrows icon)
   - **Note**: Only visible when a control dataset is loaded

5. **Normalization Widget**
   - **CSS Class**: `hic-normalization-selector-container`
   - **JavaScript Class**: `NormalizationWidget` (`js/normalizationWidget.js`)
   - **Location**: Lower navbar widget container
   - **Functionality**: Dropdown to select normalization method (None, Coverage, Balanced, etc.)
   - **Key Elements**:
     - Label: "Norm"
     - Select dropdown (`select[name="normalization_selector"]`)
     - Loading spinner (shown during normalization loading)

## Menu Panel (Side Panel)

The menu panel (`.hic-menu`) is a slide-out panel on the left side, accessible via the hamburger menu icon (`fa-bars`) in the navbar.

6. **Chromosome Selector**
   - **CSS Class**: `hic-chromosome-selector-widget-container`
   - **JavaScript Class**: `ChromosomeSelector` (`js/chromosomeSelector.js`)
   - **Location**: Menu panel
   - **Functionality**: Selects chromosomes for X and Y axes
   - **Key Elements**:
     - X-axis selector (`select[name="x-axis-selector"]`)
     - Y-axis selector (`select[name="y-axis-selector"]`)
     - Chromosome swap button (circular arrows icon)

7. **2D Annotations Widget**
   - **CSS Class**: `hic-annotation-presentation-button-container`
   - **JavaScript Class**: `AnnotationWidget` (`js/annotationWidget.js`)
   - **Location**: Menu panel
   - **Functionality**: Button to open annotation panel for managing 2D annotation tracks
   - **Key Elements**:
     - Button: "2D Annotations"
     - Annotation panel (`.hic-annotation-panel-container`) - draggable modal panel
     - Panel contains rows for each annotation track with visibility, color, display mode, and delete controls

## Contact Matrix Viewport

8. **Contact Matrix View**
   - **CSS Class**: `#${browser.id}-viewport` / `#${browser.id}-contact-map-canvas-container`
   - **JavaScript Class**: `ContactMatrixView` (`js/contactMatrixView.js`)
   - **Location**: Main viewport area
   - **Functionality**: Renders the Hi-C contact matrix heatmap
   - **Key Elements**:
     - Canvas element for rendering the matrix
     - Loading spinner (`fa-spinner`)
     - Sweep zoom container (`#${browser.id}-sweep-zoom-container`)
     - X and Y guide lines

9. **Sweep Zoom**
   - **CSS Class**: `#${browser.id}-sweep-zoom-container`
   - **JavaScript Class**: `SweepZoom` (`js/sweepZoom.js`)
   - **Location**: Overlay on contact matrix viewport
   - **Functionality**: Visual rectangle for zooming into a selected region
   - **Note**: Displayed during drag-to-zoom operations

## Scrollbars

10. **Scrollbar Widget**
    - **CSS Classes**: 
      - X-axis: `#${browser.id}-x-axis-scrollbar-container`
      - Y-axis: `#${browser.id}-y-axis-scrollbar-container`
    - **JavaScript Class**: `ScrollbarWidget` (`js/scrollbarWidget.js`)
    - **Location**: Bottom (X-axis) and right side (Y-axis) of viewport
    - **Functionality**: Visual indicators showing current view position within the chromosome
    - **Key Elements**:
      - X-axis scrollbar (`#${browser.id}-x-axis-scrollbar`) with chromosome label
      - Y-axis scrollbar (`#${browser.id}-y-axis-scrollbar`) with rotated chromosome label

## Axis Rulers

11. **X-Axis Ruler**
    - **CSS Class**: `#${browser.id}-x-axis`
    - **JavaScript Class**: `Ruler` (`js/ruler.js`)
    - **Location**: Below the contact matrix viewport
    - **Functionality**: Displays genomic coordinates along the X-axis

12. **Y-Axis Ruler**
    - **CSS Class**: `#${browser.id}-y-axis`
    - **JavaScript Class**: `Ruler` (`js/ruler.js`)
    - **Location**: Right side of the contact matrix viewport
    - **Functionality**: Displays genomic coordinates along the Y-axis

## Track Areas

13. **X-Axis Tracks**
    - **CSS Class**: `#${browser.id}-x-tracks`
    - **JavaScript Class**: `TrackRenderer` (`js/trackRenderer.js`) via `TrackPair` (`js/trackPair.js`)
    - **Location**: Above the contact matrix viewport
    - **Functionality**: Displays 1D tracks (wig, annotation, etc.) aligned with X-axis

14. **Y-Axis Tracks**
    - **CSS Class**: `#${browser.id}-y-tracks`
    - **JavaScript Class**: `TrackRenderer` (`js/trackRenderer.js`) via `TrackPair` (`js/trackPair.js`)
    - **Location**: Left side of the contact matrix viewport
    - **Functionality**: Displays 1D tracks aligned with Y-axis

## Browser Panel Controls

15. **Browser Panel Label**
    - **CSS Class**: `#${browser.id}-contact-map-hic-nav-bar-map-label`
    - **Location**: Top-left of navbar
    - **Functionality**: Displays the dataset name/label

16. **Menu Toggle Button**
    - **CSS Class**: `fa-bars`
    - **Location**: Top-right of navbar
    - **Functionality**: Toggles the menu panel visibility
    - **Handler**: `browser.toggleMenu()` method

17. **Browser Delete Button**
    - **CSS Class**: `fa-minus-circle`
    - **Location**: Top-right of navbar (only visible when multiple browsers exist)
    - **Functionality**: Deletes the browser panel
    - **Handler**: `deleteBrowser(browser)` function

18. **Control Map Label**
    - **CSS Class**: `#${browser.id}-control-map-hic-nav-bar-map-label`
    - **Location**: Second row of navbar
    - **Functionality**: Displays the control map dataset name/label (if control map is loaded)

## Component Initialization

All widgets are initialized in `BrowserUIManager` (`js/browserUIManager.js`), which:
- Creates widget instances and stores them in a `components` Map
- Associates widgets with their DOM containers
- Manages widget lifecycle and event subscriptions

## Event System

Widgets communicate through an event bus system:
- Each browser has an `eventBus` instance (`EventBus` from `js/eventBus.js`)
- Widgets subscribe to events like `LocusChange`, `MapLoad`, `ColorScale`, `DisplayMode`, etc.
- Events are posted by the browser and other components to notify widgets of state changes

## CSS Class Naming Convention

- Navbar widgets: `hic-*-widget-container` or `hic-*-selector-container`
- Menu items: `hic-*-widget-container` or `hic-*-presentation-button-container`
- Viewport elements: `#${browser.id}-*` (unique per browser instance)
- Root container: `hic-root` (with `hic-root-selected` when active)

