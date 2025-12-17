/*
 *  The MIT License (MIT)
 *
 * Copyright (c) 2016-2017 The Regents of the University of California
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of this software and
 * associated documentation files (the "Software"), to deal in the Software without restriction, including
 * without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the
 * following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all copies or substantial
 * portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
 * BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,  FITNESS FOR A PARTICULAR PURPOSE AND
 * NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
 * CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
 * ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import ColorScale, {defaultColorScaleConfig} from "./colorScale.js";
import RatioColorScale, {defaultRatioColorScaleConfig} from "./ratioColorScale.js";

/**
 * Manages color scales for all display modes.
 * 
 * Simplified model:
 * - Single colorScale: Used for both A (Contact Map) and B (Control Map) modes
 * - Single ratioColorScale: Used for AOB/BOA modes (has separate positive/negative colors)
 * - Single diffColorScale: Used for AMB mode (difference mode)
 * 
 * Terminology:
 * - Display Mode A = Contact Map (main/primary dataset, browser.dataset)
 * - Display Mode B = Control Map (secondary/comparison dataset, browser.controlDataset)
 * - AOB/BOA modes = Ratio comparisons using ratioColorScale (distinct from single colorScale)
 * - AMB mode = Difference mode (Contact Map - Control Map)
 */
class ColorScaleManager {
    constructor() {
        // Single color scale used for both A and B modes
        this.colorScale = new ColorScale(defaultColorScaleConfig);
        
        // Ratio color scale for AOB/BOA modes (separate from single colorScale)
        this.ratioColorScale = new RatioColorScale(defaultRatioColorScaleConfig.threshold);
        this.ratioColorScale.setColorComponents(defaultRatioColorScaleConfig.negative, '-');
        this.ratioColorScale.setColorComponents(defaultRatioColorScaleConfig.positive, '+');
        
        // Initialize diff color scale for AMB mode (difference mode)
        this.diffColorScale = new RatioColorScale(100);
    }
    
    /**
     * Get the appropriate color scale for a display mode.
     * @param {string} displayMode - 'A' (Contact Map), 'B' (Control Map), 'AOB', 'BOA', or 'AMB'
     * @returns {ColorScale|RatioColorScale} The color scale for the display mode
     */
    getColorScaleForDisplayMode(displayMode) {
        switch(displayMode) {
            case 'A': // Contact Map - uses single colorScale
            case 'B': // Control Map - uses same single colorScale
                return this.colorScale;
            case 'AOB':
            case 'BOA': 
                return this.ratioColorScale; // Ratio modes use separate ratioColorScale
            case 'AMB': 
                return this.diffColorScale;
            default: 
                return this.colorScale;
        }
    }
    
    // Getters
    getColorScale() { 
        return this.colorScale; 
    }
    
    getRatioColorScale() { 
        return this.ratioColorScale; 
    }
    
    getDiffColorScale() {
        return this.diffColorScale;
    }
    
    // Methods for updating scales
    setColorScale(colorScale) { 
        this.colorScale = colorScale; 
    }
    
    setRatioColorScale(ratioColorScale) { 
        this.ratioColorScale = ratioColorScale; 
    }
    
    setDiffColorScale(diffColorScale) {
        this.diffColorScale = diffColorScale;
    }
}

export default ColorScaleManager;

