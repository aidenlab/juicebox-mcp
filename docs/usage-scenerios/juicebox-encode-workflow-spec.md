# Juicebox MCP Server: ENCODE Integration Workflow Specification

## Overview

This document outlines the desired workflow for an LLM-powered MCP server integration with Juicebox, enabling intelligent discovery, loading, and exploration of Hi-C contact maps and associated genomic data from ENCODE.

---

## Workflow Stages

### 1. Experiment Discovery

**User Intent:** Find relevant Hi-C experiments on ENCODE (e.g., "I want to see if I can find some interesting loops in the heart")

**LLM Behavior:**
- Query [encodeproject.org](http://encodeproject.org) based on user's search terms
- Find all experiments matching the criteria (e.g., tissue type, lab affiliation)
- Expand search intelligently—if user searches "heart," also surface related samples like:
  - Heart atrium
  - Heart ventricle
  - Aggregate heart tissue maps

**Output Format:**
| Field | Description |
|-------|-------------|
| Experiment Accession | `ENCSR######` |
| Experiment Title | Human-readable name |
| Biosample Name | Tissue/cell type |
| Biosample Accession | `ENCBS######` |

> **Note:** Providing biosample-level detail gives users granular control and reduces hallucination risk.

---

### 2. File Selection

**Context:** Each ENCODE experiment may contain multiple `.hic` files with different properties.

**File Variants to List:**
- Mapping quality thresholds (e.g., MAPQ 0, MAPQ 30)
- Haplotype-specific maps (maternal/paternal)
- Different assembly versions

**LLM Behavior:**
- List all available `.hic` files for selected experiment(s)
- Prompt user to select specific file(s) to load

---

### 3. Map Loading & Configuration

After file selection, prompt user with common configuration options:

#### Normalization
| Option | Description |
|--------|-------------|
| `SCALE` | Most frequently used for intact Hi-C datasets (recommended default) |
| `KR` | Knight-Ruiz balancing |
| `VC` | Vanilla coverage |
| `VC_SQRT` | Square root vanilla coverage |
| `NONE` | No normalization |

#### Reference Tracks
- **Gene Track:** "Would you like an hg38 RefSeq gene track loaded with this map?"

#### Architecture Annotations
Suggest available processed data from the experiment page:

| Annotation Type | File Format | Source |
|-----------------|-------------|--------|
| Loops | `.bedpe` | HiCCUPS / Delta |
| Contact Domains | `.bedpe` | Arrowhead |
| Compartments | `.bigwig` | Eigenvector |
| Nuclease Cleavage | `.bigwig` | Cut site frequency |

**LLM Behavior:**
- Present available annotations for the selected experiment
- Allow user to select which to load alongside the contact map

---

### 4. Complementary Data Discovery

**User Intent:** Annotate features of interest with functional genomics data (e.g., "I found a loop—is it at an enhancer?")

**LLM Behavior:**
1. Use the `ENCBS` biosample accession from the loaded Hi-C map
2. Query ENCODE for other experiments linked to that biosample
3. List available complementary assays:

| Assay Type | Examples |
|------------|----------|
| Chromatin Accessibility | DNase-seq, ATAC-seq |
| Transcription | RNA-seq |
| Histone Modifications | H3K27ac, H3K4me3, H3K27me3 ChIP-seq |
| Transcription Factors | CTCF, RAD21, cohesin ChIP-seq |

**Fallback Strategy:**
If the exact biosample (`ENCBS`) has no linked experiments:
- Search for experiments from the same cell line or tissue type
- Suggest available alternatives with clear provenance

---

### 5. Track File Selection

When user selects a complementary experiment to load:

**LLM Behavior:**
- List available file types for that experiment:

| File Type | Description |
|-----------|-------------|
| `.bigWig` (fold change) | Signal over input control |
| `.bigWig` (signal p-value) | Statistical significance |
| `.bed` / `.narrowPeak` | Peak calls |
| `.bedpe` | Paired-end annotations |

- Prompt user to select preferred file type
- Load selected file as track in Juicebox

---

### 6. Guided Exploration

Once data is loaded, support two exploration modes:

#### A. Free Browsing
User navigates the genome freely to discover features of interest.

#### B. Guided Navigation
LLM suggests biologically meaningful loci based on:
- Published findings from user's lab/papers
- Known architectural features
- Gene-specific queries

**Example Prompt:**
> "Our nuclear architecture paper found that the **GATA4** locus has an enhancer clique at its promoter bound by CTCF. Would you like to navigate to this locus?"

---

## Implementation Considerations

### Data Flow
```
User Query → ENCODE API Search → Experiment Selection → File Selection
     ↓
Map Loading → Normalization → Annotation Tracks → Complementary Data
     ↓
Interactive Exploration ← LLM Suggestions
```

### Key API Integrations
- **ENCODE REST API:** Experiment/file metadata queries
- **Juicebox MCP Server:** Map loading, track management, navigation
- **Reference Genome Services:** Gene annotations, RefSeq tracks

### User Experience Principles
1. **Transparency:** Always show accession IDs to prevent hallucination
2. **Progressive Disclosure:** Don't overwhelm—prompt one decision at a time
3. **Smart Defaults:** Suggest commonly-used options (e.g., SCALE normalization)
4. **Contextual Suggestions:** Offer relevant next steps based on loaded data

---

## Example Interaction Flow

```
User: "I want to explore Hi-C data from heart tissue"

LLM: Found 5 heart-related Hi-C experiments from your lab on ENCODE:
     1. ENCSR123456 - Heart Left Ventricle (ENCBS111111)
     2. ENCSR234567 - Heart Right Atrium (ENCBS222222)
     3. ENCSR345678 - Heart Aggregate (ENCBS333333)
     ...
     Which experiment(s) would you like to load?

User: "Let's look at the left ventricle"

LLM: ENCSR123456 has 3 available .hic files:
     1. MAPQ30 filtered (recommended)
     2. MAPQ0 (all reads)
     3. Haplotype-resolved
     Which would you like to load?

User: "MAPQ30"

LLM: Loading heart left ventricle Hi-C map...
     
     Configuration options:
     • Normalization: SCALE (recommended) / KR / VC / NONE
     • Load RefSeq gene track? (recommended)
     • Available annotations: loops.bedpe, domains.bedpe, compartments.bigwig
     
     What would you like to include?

User: "SCALE normalization, gene track, and loops"

LLM: ✓ Loaded Hi-C map with SCALE normalization
     ✓ Added RefSeq gene track
     ✓ Added loop annotations (2,847 loops)
     
     Would you like to load complementary functional data?
     Available for this biosample:
     • H3K27ac ChIP-seq (enhancer marks)
     • CTCF ChIP-seq (insulator protein)
     • RNA-seq (gene expression)

User: "Add H3K27ac"

LLM: H3K27ac ChIP-seq files available:
     1. bigWig - fold change over control
     2. bigWig - signal p-value
     3. narrowPeak - peak calls
     
     Which format?

User: "Fold change bigWig"

LLM: ✓ Added H3K27ac fold change track
     
     Ready to explore! Some suggestions:
     • Navigate to GATA4 (cardiac transcription factor with known enhancer architecture)
     • Navigate to MYH7 (cardiac myosin gene)
     • Browse freely
```

---

## Future Enhancements

- [ ] Cache frequently accessed ENCODE metadata
- [ ] Support batch loading of multiple complementary tracks
- [ ] Integration with IGV for 1D genome browsing alongside Hi-C
- [ ] Export session configurations for reproducibility
- [ ] Support for non-ENCODE data sources (4DN, GEO)
