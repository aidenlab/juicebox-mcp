---
name: Enhanced Keyword Search
overview: Enhance the existing keyword-based search with query expansion, field weighting, fuzzy matching, and metadata enrichment to improve semantic search capabilities without requiring RAG infrastructure.
todos:
  - id: create-query-expander
    content: Create src/queryExpander.js with synonym dictionary and expandQuery() function
    status: pending
  - id: create-metadata-enricher
    content: Create src/metadataEnricher.js with enrichment rules for computed fields
    status: pending
  - id: enhance-map-filter
    content: Enhance src/mapFilter.js with field weighting, query expansion integration, and fuzzy matching
    status: pending
  - id: integrate-enrichment
    content: Integrate metadata enrichment into src/dataParsers.js to enrich maps after parsing
    status: pending
  - id: add-unit-tests
    content: Add unit tests for query expansion, fuzzy matching, field weighting, and metadata enrichment
    status: pending
---

# Enhanced Keyword Search Implementation Plan

## Overview

Enhance the current keyword-based search system (`mapFilter.js`) with four key improvements:

1. **Query Expansion** - Expand queries with synonyms and related terms
2. **Field Weighting** - Prioritize matches in important fields (Assembly, Biosource)
3. **Fuzzy Matching** - Handle typos and approximate matches
4. **Metadata Enrichment** - Add computed fields to aid search and reasoning

## Architecture

```mermaid
flowchart TD
    UserQuery[User Query] --> QueryExpander[Query Expansion Module]
    QueryExpander --> ExpandedTerms[Expanded Terms]
    ExpandedTerms --> EnhancedFilter[Enhanced Filter]
    
    Maps[Map Entries] --> MetadataEnricher[Metadata Enrichment]
    MetadataEnricher --> EnrichedMaps[Enriched Maps]
    
    EnrichedMaps --> EnhancedFilter
    EnhancedFilter --> ScoredResults[Scored & Ranked Results]
    
    QueryExpander -.->|Uses| SynonymDict[Synonym Dictionary]
    EnhancedFilter -.->|Uses| FieldWeights[Field Weight Config]
    MetadataEnricher -.->|Uses| EnrichmentRules[Enrichment Rules]
```

## Implementation Components

### 1. Query Expansion Module

**New File**: `src/queryExpander.js`

- **Purpose**: Expand user queries with synonyms and related terms
- **Key Function**: `expandQuery(query)` - Returns array of expanded terms
- **Synonym Dictionary**: Domain-specific synonyms for genomics terms
  - Species: "human" → ["Homo sapiens", "hg38", "hg19", "hg37"]
  - Species: "mouse" → ["Mus musculus", "mm10", "mm39", "mm9"]
  - Cell types: Common cell line names and aliases
  - Assembly versions: Map common names to version numbers

**Example**:

```javascript
expandQuery("human hg38") 
// Returns: ["human", "homo sapiens", "hg38", "hg19", "hg37"]
```

### 2. Enhanced Filter with Field Weighting

**Modified File**: `src/mapFilter.js`

**Changes**:

- Add field weight configuration (higher weight = more important)
- Integrate query expansion
- Add fuzzy matching support
- Improve scoring algorithm to use field weights

**Field Weight Configuration**:

```javascript
const FIELD_WEIGHTS = {
  'name': 1.5,           // Map name/description is important
  'Assembly': 2.0,       // Assembly is very important
  'Biosource': 1.8,      // Biosource is very important
  'Biosample': 1.8,      // Biosample is very important
  'Lab': 1.2,            // Lab is moderately important
  'Project': 1.0,        // Project is standard importance
  'Assay': 1.0,          // Assay is standard importance
  'url': 0.3,            // URL matches are less important
  // Other fields default to 1.0
};
```

**Scoring Algorithm Updates**:

- Multiply match scores by field weights
- Sum scores across all expanded terms
- Apply fuzzy matching bonus for approximate matches

### 3. Fuzzy Matching

**Implementation**: Simple Levenshtein distance-based matching

- **Threshold**: Terms within 2-3 character edits are considered matches
- **Bonus Scoring**: Fuzzy matches get lower scores than exact matches
- **Use Case**: Handle typos like "hg38" → "hg39" or "human" → "humna"

**Approach**:

- Use a lightweight implementation (no external dependencies)
- Only apply fuzzy matching if exact match fails
- Limit fuzzy matching to terms > 3 characters

### 4. Metadata Enrichment

**New File**: `src/metadataEnricher.js`

**Purpose**: Add computed fields to map entries to aid search and reasoning

**Enrichment Rules**:

- **`_isRecent`**: Boolean flag based on Accession patterns or publication dates (if available)
- **`_normalizedAssembly`**: Standardized assembly names (e.g., "hg38" → "GRCh38")
- **`_species`**: Extracted species name from Biosource/Biosample
- **`_cellTypeCategory`**: Categorized cell types (e.g., "cancer", "normal", "stem")
- **`_searchableText`**: Concatenated searchable fields for full-text matching

**Integration Point**:

- Call enrichment in `dataParsers.js` after parsing TSV data
- Enriched fields prefixed with `_` to distinguish from original metadata

## File Changes

### New Files

1. **`src/queryExpander.js`**

   - `expandQuery(query)` - Main expansion function
   - `SYNONYM_DICTIONARY` - Domain-specific synonyms
   - `expandTerm(term)` - Expand individual terms

2. **`src/metadataEnricher.js`**

   - `enrichMapMetadata(map)` - Enrich single map entry
   - `enrichMaps(maps)` - Enrich array of maps
   - Enrichment rule functions

### Modified Files

1. **`src/mapFilter.js`**

   - Import `queryExpander` and `metadataEnricher`
   - Add `FIELD_WEIGHTS` configuration
   - Update `filterMaps()` to:
     - Expand queries before filtering
     - Apply field weights in scoring
     - Support fuzzy matching
   - Add `fuzzyMatch(term, value)` helper function
   - Update scoring algorithm to use weights

2. **`src/dataParsers.js`**

   - Import `metadataEnricher`
   - Call `enrichMaps()` after parsing TSV data (in `parseTSV()`)
   - Ensure enriched metadata is included in returned map entries

3. **`src/dataSourceConfigs.js`** (Optional)

   - Add field weight configuration per source if needed
   - Document which fields are most important per source

## Implementation Details

### Query Expansion Strategy

- **Case-insensitive**: All expansions are lowercase
- **Bidirectional**: "human" expands to assemblies, assemblies expand to "human"
- **Context-aware**: Consider term position (first term might be species, second might be assembly)
- **Limit expansions**: Don't expand too aggressively (max 3-5 synonyms per term)

### Fuzzy Matching Algorithm

- **Levenshtein Distance**: Calculate edit distance between query term and field value
- **Threshold**: Match if distance ≤ 2 for terms ≤ 5 chars, ≤ 3 for longer terms
- **Scoring**: `fuzzyScore = exactScore * (1 - distance/maxLength) * 0.7`
- **Performance**: Only apply to terms that don't have exact matches

### Metadata Enrichment Rules

- **`_isRecent`**: 
  - Check Accession patterns (newer accessions might indicate recent data)
  - Or parse Publication dates if available
  - Default to `false` if cannot determine

- **`_normalizedAssembly`**:
  - Map common names: "hg38" → "GRCh38", "mm10" → "GRCm38"
  - Keep original in metadata, add normalized version

- **`_species`**:
  - Extract from Biosource: "Homo sapiens" → "human"
  - Extract from Biosample if Biosource unavailable
  - Lowercase, normalized

- **`_cellTypeCategory`**:
  - Pattern matching: "K562", "HeLa" → "cancer"
  - "GM12878", "IMR90" → "normal"
  - "iPSC", "ESC" → "stem"
  - Default to empty string if cannot categorize

- **`_searchableText`**:
  - Concatenate: name + all metadata values (space-separated)
  - Lowercase for consistent searching
  - Used for full-text matching fallback

### Scoring Algorithm

**Current**: Simple score based on match position (exact > starts with > contains)

**Enhanced**:

```javascript
score = baseMatchScore * fieldWeight * expansionWeight * fuzzyMultiplier
```

- **baseMatchScore**: Existing scoring (100 for exact, 80 for starts with, 50 for contains)
- **fieldWeight**: From FIELD_WEIGHTS configuration
- **expansionWeight**: 1.0 for original term, 0.8 for expanded synonyms
- **fuzzyMultiplier**: 0.7 for fuzzy matches, 1.0 for exact matches

**Final Score**: Sum across all matching terms and fields

## Testing Strategy

1. **Unit Tests** (`test/queryExpander.test.js`):

   - Test query expansion with various inputs
   - Verify synonym dictionary coverage

2. **Unit Tests** (`test/mapFilter.test.js`):

   - Test field weighting affects ranking
   - Test fuzzy matching handles typos
   - Test scoring algorithm produces expected rankings

3. **Unit Tests** (`test/metadataEnricher.test.js`):

   - Test enrichment rules produce correct computed fields
   - Test edge cases (missing fields, empty values)

4. **Integration Tests**:

   - End-to-end: query → expansion → filtering → ranking
   - Verify enriched metadata is available in search results

## Performance Considerations

- **Query Expansion**: Should be fast (< 1ms) - use simple dictionary lookup
- **Fuzzy Matching**: Only apply when exact match fails to avoid performance hit
- **Metadata Enrichment**: Run once per map during parsing, cache results
- **Scoring**: Current O(n*m) complexity where n=maps, m=terms - acceptable for current dataset size

## Backward Compatibility

- **API**: No changes to `filterMaps()` function signature
- **Results**: Enriched fields are additive (prefixed with `_`), don't break existing code
- **Behavior**: Existing queries should work the same or better (more matches via expansion)

## Future Enhancements (Out of Scope)

- Machine learning-based ranking
- User query history for personalization
- Advanced fuzzy matching with phonetic algorithms
- Query suggestion/autocomplete

## Dependencies

- **No new external dependencies required**
- Use built-in JavaScript string methods for fuzzy matching
- Keep implementation lightweight and fast