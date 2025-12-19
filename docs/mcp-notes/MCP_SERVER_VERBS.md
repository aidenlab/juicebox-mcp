# MCP Server Verbs - Juicebox.js API Actions

This document identifies the core "verbs" (actions/functions) that could be exposed as MCP server tools for programmatically controlling Juicebox.js. These verbs are derived from the application's functionality and represent the key operations users can perform.

## Browser Management

### Initialize
- **init** - Initialize the application with container and config

## Navigation & Locus Control

### Direct Navigation
- **goto** - Navigate to specific genomic locus (chr1, bpX, bpXMax, chr2, bpY, bpYMax)
- **parseGotoInput** - Parse locus string input (e.g., "chr1:1000-2000 chr2:3000-4000")
- **parseLocusString** - Parse a single locus string to object
- **lookupFeatureOrGene** - Search for and navigate to a gene or feature by name

### Chromosome Selection
- **setChromosomes** - Set chromosomes for X and Y axes
- **getChromosomes** - Get current chromosome selection

### Pan & Zoom
- **shiftPixels** - Pan the view by pixel offset (dx, dy)
- **pinchZoom** - Zoom with anchor point and scale factor
- **handleWheelZoom** - Handle mouse wheel zoom events
- **zoomAndCenter** - Zoom in/out and center on specific pixel coordinates
- **setZoom** - Set zoom level by index
- **minZoom** - Get minimum zoom level for current chromosomes
- **minPixelSize** - Calculate minimum pixel size for given chromosomes and zoom

## Data Loading

### Main Dataset
- **loadHicFile** - Load a .hic file as the main dataset

### Control Dataset
- **loadHicControlFile** - Load a control .hic file for comparison

### Tracks
- **loadTracks** - Load one or more tracks (1D or 2D annotations)
- **removeTrack** - Remove a specific track
- **removeAllTracks** - Remove all tracks

## Display Configuration

### Normalization
- **setNormalization** - Set normalization method (NONE, VC, VC_SQRT, KR, etc.)
- **getNormalization** - Get current normalization method

### Color Scale
- **setColorScaleThreshold** - Set color scale threshold value
- **getColorScale** - Get current color scale configuration
- **setColorScale** - Set color scale configuration
- **setBackgroundColor** - Set contact matrix background color

### Display Mode (for control maps)
- **setDisplayMode** - Set display mode (A, B, AOB, BOA)
- **getDisplayMode** - Get current display mode
- **toggleDisplayMode** - Toggle between display modes
- **toggleDisplayModeCycle** - Enable/disable automatic cycling through display modes

### Resolution
- **setResolution** - Set resolution/zoom level
- **getResolutions** - Get available resolution options
- **setResolutionLock** - Lock/unlock resolution from auto-changing
- **isWholeGenome** - Check if currently viewing whole genome

## Track Management

### Track Configuration
- **setTrackName** - Set/rename a track
- **setTrackColor** - Set track color
- **unsetTrackColor** - Remove custom track color
- **setTrackVisibility** - Show/hide a track (for 2D tracks)
- **setTrackDisplayMode** - Set display mode for 2D track (upper/lower/all)

### Track Ordering
- **moveTrackUp** - Move track up in display order
- **moveTrackDown** - Move track down in display order
- **reorderTracks** - Reorder tracks by index array

### Track Data Range (for numeric tracks)
- **setTrackDataRange** - Set min/max data range for track
- **setTrackAutoscale** - Enable/disable autoscaling for track
- **setTrackLogScale** - Enable/disable log scale for track

## State Management

### State Queries
- **getState** - Get current browser state (locus, zoom, normalization, etc.)
- **setState** - Set browser state from state object
- **getSyncState** - Get state suitable for synchronization
- **syncState** - Synchronize to a target state
- **canBeSynched** - Check if browser can sync with given state

### Genomic State
- **genomicState** - Get genomic coordinates for X or Y axis
- **toJSON** - Export browser state as JSON

## Session Management

### Session Operations
- **saveSession** - Save current session state (toJSON)
- **restoreSession** - Restore browser from session configuration
- **compressedSession** - Get compressed session string for URL sharing
- **clearSession** - Clear current session (remove tracks, reset display)

### Export/Import
- **exportState** - Export browser state to JSON
- **importState** - Import browser state from JSON

## Rendering & Updates

### Update Operations
- **update** - Update/repaint the browser view
- **repaint** - Force repaint of browser
- **repaintMatrix** - Repaint only the contact matrix
- **updateLayout** - Update layout after track changes

### Crosshairs
- **showCrosshairs** - Show crosshair indicators
- **hideCrosshairs** - Hide crosshair indicators
- **setCustomCrosshairsHandler** - Set custom handler for crosshair updates
- **updateCrosshairs** - Update crosshair position

## UI Control

### Menu & Visibility
- **showMenu** - Show the side menu panel
- **hideMenu** - Hide the side menu panel
- **toggleMenu** - Toggle menu visibility
- **toggleTrackLabelAndGutter** - Show/hide track labels and gutters

### Spinner/Loading
- **startSpinner** - Show loading spinner
- **stopSpinner** - Hide loading spinner

## Query & Information

### Dataset Information
- **getDataset** - Get current active dataset
- **getControlDataset** - Get control dataset (if loaded)
- **getGenome** - Get genome information
- **getChromosomes** - Get list of chromosomes

### View Information
- **getViewDimensions** - Get viewport width and height
- **getViewportSize** - Get current viewport size configuration
- **setViewportSize** - Set viewport dimensions

### Resolution Information
- **getResolutions** - Get available resolution levels
- **getCurrentResolution** - Get current resolution/zoom level
- **resolution** - Get current resolution bin size

## Advanced Operations

### Matrix Operations
- **getMatrix** - Get contact matrix data for region
- **clearImageCaches** - Clear cached matrix tiles

### Track Rendering
- **renderTrackXY** - Manually trigger track rendering

### Browser Configuration
- **reset** - Reset browser to initial state
- **setFigureMode** - Enable/disable figure mode (minimal UI)

## Event System

### Event Subscription (for MCP server awareness)
- **subscribe** - Subscribe to browser events
- **unsubscribe** - Unsubscribe from browser events
- **notify** - Post event to event bus (internal, but useful for understanding)

## Notes on Verb Organization

### High-Level vs Low-Level
Some verbs represent high-level user actions (e.g., `goto`, `loadHicFile`) while others are lower-level operations (e.g., `shiftPixels`, `repaintMatrix`). The MCP server may want to expose both:
- High-level verbs for common operations
- Low-level verbs for fine-grained control

### Browser Instance Context
Most verbs operate on a browser instance. The MCP server will need to:
- Track which browser is "current" or allow specifying browser ID
- Handle multi-browser scenarios
- Provide browser selection/management verbs

### Async Operations
Many verbs are async (return Promises) because they involve:
- Network requests (loading files)
- Data processing (parsing, rendering)
- State updates

The MCP server should handle these appropriately.

### State Synchronization
When multiple browsers are synced, actions on one browser affect others. The MCP server should be aware of this and potentially:
- Expose sync management verbs
- Document sync behavior
- Allow disabling sync for specific operations

## Recommended MCP Tool Categories

Based on these verbs, the MCP server tools could be organized as:

1. **Browser Management Tools** - create, delete, select browsers
2. **Navigation Tools** - goto, pan, zoom, set chromosomes
3. **Data Loading Tools** - load datasets, tracks, normalization files
4. **Display Configuration Tools** - normalization, color scale, display mode
5. **Track Management Tools** - add, remove, configure tracks
6. **Session Tools** - save, restore, export sessions
7. **Query Tools** - get state, get information, get options
8. **UI Control Tools** - show/hide UI elements, toggle visibility

