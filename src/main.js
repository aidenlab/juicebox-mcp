import { Application } from './Application.js';

// Default configuration
const config =
    {
        backgroundColor: '255,255,255'
    }

// Legacy configuration format (backward compatible)
// Single colorScale applies to the map matching displayMode
const debug_config =
    {
        "backgroundColor": "0,74,136",
        "url": "https://hicfiles.s3.amazonaws.com/hiseq/imr90/in-situ/combined.hic",
        "name": "Combined",
        "state": "7,7,5,815.66029,815.66029,640,640,1,NONE",
        "colorScale": "23,255,114,110",  // Applied to Control Map since displayMode is "B"
        "selectedGene": "egfr",
        "nvi": "13433880319,35723",
        "controlUrl": "https://s3.amazonaws.com/hicfiles/hiseq/degron/untreated/unsynchronized/HIC005.hic",
        "controlName": "Untreated, HIC005",
        "displayMode": "B",
        "controlNvi": "6846576837,36479"
    }

// Simplified configuration format demonstrating the refactored color scale system
// Key principle: Single colorScale for A/B modes, separate ratioColorScale for AOB/BOA modes
const enhanced_config =
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
        // Format: "threshold,r,g,b" (e.g., "2000,255,0,0" = threshold 2000, red)
        "colorScale": "2000,255,0,0",  // Used for both Contact Map (A) and Control Map (B)
        
        // Background color - Single background color shared across ALL modes (A, B, AOB, BOA)
        // Format: "r,g,b" (e.g., "255,255,255" = white)
        "backgroundColor": "255,255,255",  // Shared background for all display modes
        
        // Ratio color scale - Used for AOB/BOA ratio modes (only relevant when controlUrl is present)
        // Format: "R:threshold:positiveScale:negativeScale"
        //   - threshold: Ratio threshold (e.g., 5 means ratios > 5 are positive, < 1/5 are negative)
        //   - positiveScale: "logThreshold,r,g,b" for positive ratios (ratios > threshold)
        //   - negativeScale: "logThreshold,r,g,b" for negative ratios (ratios < 1/threshold)
        // Example: "R:5:1.609,255,0,0:1.609,0,0,255" means:
        //   - Threshold: 5
        //   - Positive (ratios > 5): Red (255,0,0)
        //   - Negative (ratios < 0.2): Blue (0,0,255)
        // Note: If not specified, defaults are used (threshold=5, positive=red, negative=blue)
        // This is saved automatically when users adjust ratio colors via the UI
        "ratioColorScale": "R:5:1.6094379124341003,255,0,0:1.6094379124341003,0,0,255",
        
        // Initial display mode
        // Options: 
        // "A" (Contact Map), 
        // "B" (Control Map), 
        // "AOB" (Contact/Control ratio), 
        // "BOA" (Control/Contact ratio),
        // "AMB" (Contact Map - Control Map)
        "displayMode": "A",  // Start showing Contact Map
        
        // Optional: Gene selection
        "selectedGene": "egfr"
    }

// Initialize application
const app = new Application();

// Use enhanced_config to demonstrate the simplified color scale system
// Switch to debug_config to use legacy format
app.init(document.getElementById('app-container'), enhanced_config)
    .then(() => {
        console.log('Juicebox MCP application initialized');
        console.log('Using simplified color scale model:');
        console.log('- Single colorScale (used for both A and B modes):', enhanced_config.colorScale);
        console.log('- Single backgroundColor (shared across all modes):', enhanced_config.backgroundColor);
        console.log('- Ratio colorScale (for AOB/BOA modes):', enhanced_config.ratioColorScale);
    })
    .catch((error) => {
        console.error('Error initializing application:', error);
    });
