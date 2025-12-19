# Locus Specification Enhancements

## Overview

This document describes the enhancements made to locus specification in Juicebox MCP to support natural language input and combined map loading with locus navigation. These improvements make it easier for users to specify genomic locations using natural, conversational language. **Users can navigate to a locus independently of map loading** - a map can already be loaded and users can simply navigate to different genomic regions. Alternatively, users can combine map loading with locus specification in a single command.

## Problem Statement

Previously, users had to specify loci in a strict format like `"chr1:1000-2000"`, which is cumbersome in conversational interfaces. Additionally, users wanted to combine map loading requests with locus specification in a single command, such as "load a map from lab X for cell type Y at locus Z".

## Solution

We implemented four key enhancements:

1. **Natural Language Locus Parsing** - Parse conversational locus descriptions
2. **Flexible Number Formats** - Support various number formats (K/M suffixes, commas, scientific notation, megabase/kilobase terminology)
3. **Independent Locus Navigation** - Navigate to a locus when a map is already loaded (via `goto_locus` tool)
4. **Combined Map and Locus Commands** - Extract both map criteria and locus from a single natural language command (optional)

## Implementation

### 1. Natural Language Locus Parsing

The `normalizeLocusInput()` method converts natural language locus descriptions into standard format.

**Supported Patterns:**
- `"chromosome 1 from 1000 to 2000"` → `"chr1:1000-2000"`
- `"chr1 1000-2000"` → `"chr1:1000-2000"`
- `"position 1000 on chromosome 1"` → `"chr1:500000-1500000"` (defaults to 1MB window)
- `"chr1 starting at 1000 ending at 2000"` → `"chr1:1000-2000"`
- `"chr1"` → `"chr1"` (whole chromosome)

**Location:** `js/interactionHandler.js` - `normalizeLocusInput()`

### 2. Enhanced Number Parsing

The `_parseNumber()` helper method supports multiple number formats:

- **Commas:** `"1,000"` → `1000`
- **K/M suffixes:** `"1M"` → `1000000`, `"1000K"` → `1000000`
- **Natural language:** `"10 megabases"` → `10000000`, `"25 kilobases"` → `25000`
- **Abbreviations:** `"10mb"` → `10000000`, `"500kb"` → `500000`
- **Scientific notation:** `"1e6"` → `1000000`

**Location:** `js/interactionHandler.js` - `_parseNumber()`

### 3. Independent Locus Navigation Tool

The `goto_locus` MCP tool allows users to navigate to a locus when a map is already loaded. This is the **most common use case** - users load a map once, then navigate to different genomic regions.

**MCP Tool:** `goto_locus`
- Accepts locus as string or object
- Works with natural language, standard format, gene names, and megabase/kilobase terminology
- Single chromosome applies to both axes (chr1 and chr2)

**Location:** `server.js` - `goto_locus` tool registration, `src/Application.js` - `_gotoLocus()` handler

### 4. Flexible Locus Input Method

The `parseLocusInputFlexible()` method is the main entry point for locus navigation. It accepts both string and object formats:

**String Input:**
- Natural language: `"chromosome 1 from 1000 to 2000"` or `"chromosome 1 from 10 megabases to 20 megabases"`
- Standard format: `"chr1:1000-2000"` or `"chr1:10mb-20mb"`
- Gene names: `"BRCA1"` (via gene lookup)

**Object Input:**
```javascript
{
  chr: "chr1",
  start: 1000,
  end: 2000
}
```

**Key Feature:** Single chromosome specification applies to both axes (chr1 and chr2) in Hi-C maps.

**Location:** `js/interactionHandler.js` - `parseLocusInputFlexible()`

### 5. Combined Map and Locus Parsing (Optional)

The `parseMapAndLocusCommand()` method extracts both map criteria and locus from combined natural language commands. **This is optional** - users can also load a map first, then navigate to a locus separately.

**Supported Map Criteria:**
- **Lab:** `"from lab X"`, `"by lab X"`
- **Cell Type:** `"for K562 cells"`, `"for cell type GM12878"`
- **Source:** `"from 4DN"`, `"from ENCODE"`
- **Assembly:** `"hg38"`, `"mm10"`, `"assembly GRCh38"`
- **Biosource:** `"biosource K562"`, `"biosample GM12878"`

**Supported Locus Patterns:**
- `"at chr1:1000-2000"`
- `"at BRCA1"` (gene name)
- `"at chromosome 1 from 1000 to 2000"`
- `"chr1:1000-2000"` (at end of command)

**Location:** `js/interactionHandler.js` - `parseMapAndLocusCommand()`

## API Methods

### Browser API

All methods are exposed through `HICBrowser`:

```javascript
// Natural language locus parsing
await browser.parseLocusInputFlexible("chromosome 1 from 1000 to 2000");

// Combined map and locus parsing
const parsed = browser.parseMapAndLocusCommand("load a map from 4DN for K562 cells at chr1:1000-2000");
```

### InteractionHandler API

```javascript
// Normalize natural language to standard format
const normalized = interactions.normalizeLocusInput("chromosome 1 from 1000 to 2000");

// Parse flexible input (string or object)
await interactions.parseLocusInputFlexible(input);

// Parse combined map and locus command
const result = interactions.parseMapAndLocusCommand("load map from lab X at chr1:1000-2000");
```

## Usage Examples

### Example 1: Navigate to Locus (Map Already Loaded)

**Most Common Use Case:** User has a map loaded and wants to navigate to a different genomic region.

```javascript
// Via MCP tool: goto_locus
goto_locus({locus: "BRCA1"})
goto_locus({locus: "chr1:1000-2000"})
goto_locus({locus: "chromosome 1 from 10 megabases to 20 megabases"})
goto_locus({locus: {chr: "chr1", start: 1000, end: 2000}})

// Via browser API:
await browser.parseLocusInputFlexible("chromosome 1 from 1000 to 2000");
// Navigates to chr1:1000-2000 on both axes
```

### Example 2: Gene Name Navigation

```javascript
// User input: "BRCA1"
await browser.parseLocusInputFlexible("BRCA1");
// Looks up BRCA1 gene and navigates to its location
```

### Example 3: Natural Language with Megabase/Kilobase Terminology

```javascript
// User input: "chromosome 1 from 10 megabases to 20 megabases"
await browser.parseLocusInputFlexible("chromosome 1 from 10 megabases to 20 megabases");
// Navigates to chr1:10000000-20000000 on both axes

// Also supports: "25 kilobases", "1.5 megabases", "10mb", "500kb"
```

### Example 4: Structured Object

```javascript
// User input: {chr: "chr1", start: 1000, end: 2000}
await browser.parseLocusInputFlexible({chr: "chr1", start: 1000, end: 2000});
// Navigates to chr1:1000-2000 on both axes
```

### Example 5: Load Map with Locus (Optional)

**Optional Use Case:** User wants to load a map AND navigate to a specific locus in one command.

```javascript
// Via MCP tool: load_map with locus parameter
load_map({
  url: "https://...",
  name: "Map Name",
  locus: "chr1:1000-2000"  // Optional locus parameter
})

// Or via combined command parsing:
const parsed = browser.parseMapAndLocusCommand("load a map from 4DN for K562 cells at chr1:1000-2000");

// Returns:
// {
//   mapCriteria: {
//     source: "4dn",
//     cellType: "K562",
//     query: "K562"
//   },
//   locus: "chr1:1000-2000"
// }

// Then use search_maps and load_map:
// 1. Search: search_maps({source: "4dn", query: "K562"})
// 2. Load: load_map({url: foundUrl, locus: "chr1:1000-2000"})
```

## Example Phrases

### Locus Navigation (Map Already Loaded) - Most Common

**Independent locus specification** - Use these when a map is already loaded and you want to navigate:

- `"go to chr1:1000-2000"`
- `"navigate to BRCA1"`
- `"show chromosome 1 from 1000 to 2000"`
- `"go to chr1:10 megabases-20 megabases"`
- `"navigate to chromosome 1 from 10 megabases to 20 megabases"`
- `"show position 5 megabases on chromosome 1"`
- `"go to chr1:1M-2M"`
- `"navigate to chr1:1,000,000-2,000,000"`
- `"show BRCA1"`
- `"go to TP53"`

**Via MCP `goto_locus` tool:**
- `goto_locus({locus: "chr1:1000-2000"})`
- `goto_locus({locus: "BRCA1"})`
- `goto_locus({locus: "chromosome 1 from 10 megabases to 20 megabases"})`
- `goto_locus({locus: {chr: "chr1", start: 10000000, end: 20000000}})`

### Combined Map + Locus (Optional)

**Optional:** Combine map loading with locus specification in a single command:

- `"load a map from lab Lieberman-Aiden at chr1:1000000-2000000"`
- `"show me maps from 4DN for K562 cells at BRCA1"`
- `"load map from ENCODE for cell type GM12878 at chr1:1000-2000"`
- `"load a map from lab Dekker for K562 cells at chromosome 1 from 10 megabases to 20 megabases"`
- `"show me maps from 4DN for hg38 at TP53"`
- `"load map from 4DN at chr1:1M-2M"`

**Note:** You can also load a map first, then navigate to a locus separately using the `goto_locus` tool.

## Integration with Existing Code

### Backward Compatibility

All existing code continues to work:
- `parseGotoInput()` now uses `normalizeLocusInput()` internally
- Standard format strings (`"chr1:1000-2000"`) still work
- Existing `loadHicFile()` already supports `locus` parameter

### Data Loading

The `loadHicFile()` method in `dataLoader.js` already supports locus specification:

```javascript
await browser.loadHicFile({
  url: mapUrl,
  name: mapName,
  locus: "chr1:1000-2000"  // Already supported!
});
```

When `locus` is provided, it calls `parseGotoInput()` after loading the map, which now supports natural language.

## Design Decisions

### Single Chromosome → Both Axes

When a single chromosome is specified (e.g., `"chr1"` or `{chr: "chr1"}`), it applies to both axes (chr1 and chr2) in the Hi-C contact map. This is the default behavior for Hi-C maps where both axes typically show the same chromosome.

### Locus Normalization Order

1. First, try to parse as standard format
2. If that fails, try natural language patterns
3. If that fails, try gene/feature lookup
4. If that fails, return error

### Map Criteria Extraction

The `parseMapAndLocusCommand()` method extracts map criteria first, then removes it from the input before extracting the locus. This prevents conflicts between map criteria keywords and locus specifications.

## Future Enhancements

Potential future improvements:

1. **Relative Navigation:** "zoom in here", "show more", "go to center"
2. **Context-Aware:** Use current view as reference for relative positions
3. **Multiple Loci:** Support specifying different loci for X and Y axes separately
4. **Locus Suggestions:** Auto-complete for common loci or recently viewed regions

## Files Modified

- `js/interactionHandler.js` - Added normalization and parsing methods
- `js/hicBrowser.js` - Exposed new methods through browser API
- `docs/LOCUS_SPECIFICATION_ENHANCEMENTS.md` - This documentation

## Related Documentation

- `docs/MCP_SERVER_VERBS.md` - MCP server tool documentation
- `docs/datasource-notes/DATA_SOURCE_SEARCH_IMPLEMENTATION.md` - Map search implementation
- `docs/datasource-notes/ENHANCED_KEYWORD_SEARCH.md` - Search capabilities

