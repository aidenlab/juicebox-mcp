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
 *
 */

/**
 * Created by dat on 3/3/17.
 */
import { IGVColor, StringUtils } from '../node_modules/igv-utils/src/index.js';
import { DOMUtils, ColorPicker } from '../node_modules/igv-ui/dist/igv-ui.js';
import RatioColorScale, { defaultRatioColorScaleConfig } from './ratioColorScale.js';
import ContactMatrixView from "./contactMatrixView.js";
import ColorScale from "./colorScale.js";
import {parseRgbString} from "./utils.js"

/**
 * ColorScaleWidget provides UI controls for managing color scales and thresholds.
 * 
 * ═══════════════════════════════════════════════════════════════════════════════
 * IMPORTANT: THE MEANING OF COLOR TILES CHANGES BASED ON DISPLAY MODE
 * ═══════════════════════════════════════════════════════════════════════════════
 * 
 * SCENARIO 1: SINGLE MAP MODE (Display Mode A or B)
 * ──────────────────────────────────────────────────────────────────────────────
 * Visible tiles: [BLUE] [RED]
 * 
 *   [BLUE TILE] = backgroundColorSwatch
 *     → Controls BACKGROUND color (empty areas between contacts)
 *     → Always visible, always controls background
 *     → Created: line 78, Handler: createColorPicker(browser, swatch) - no type
 * 
 *   [RED TILE] = foregroundColorSwatch  
 *     → Controls FOREGROUND color scale (the color of contact data)
 *     → Uses single colorScale (shared by both A and B modes)
 *     → Created: line 95, Handler: createColorPicker(browser, swatch, '+')
 * 
 * ──────────────────────────────────────────────────────────────────────────────
 * 
 * SCENARIO 2: RATIO MODE (Display Mode AOB or BOA)
 * ──────────────────────────────────────────────────────────────────────────────
 * Visible tiles: [BACKGROUND] [BLUE] [RED]
 * 
 *   [BACKGROUND TILE] = backgroundColorSwatch (same as Scenario 1)
 *     → Controls BACKGROUND color (empty areas between contacts)
 *     → Color can be any user-chosen color (often gray, but user-configurable)
 *     → Same background color shared across all modes
 *     → Created: line 78, Handler: createColorPicker(browser, swatch) - no type
 * 
 *   [BLUE TILE] = negativeRatioColorSwatch (HIDDEN in A/B modes)
 *     → Controls NEGATIVE ratio color (ratios < 1/threshold, depleted regions)
 *     → Uses ratioColorScale.negativeScale (separate from single colorScale)
 *     → Created: line 86, Handler: createColorPicker(browser, swatch, '-')
 *     → Only visible in AOB/BOA modes
 * 
 *   [RED TILE] = foregroundColorSwatch (same element as Scenario 1, different meaning!)
 *     → Controls POSITIVE ratio color (ratios > threshold, enriched regions)
 *     → Uses ratioColorScale.positiveScale (separate from single colorScale)
 *     → Created: line 95, Handler: createColorPicker(browser, swatch, '+')
 *     → NOTE: This is the SAME tile as Scenario 1, but controls ratio colors in ratio mode
 * 
 * ──────────────────────────────────────────────────────────────────────────────
 * 
 * KEY INSIGHT: The RED TILE (foregroundColorSwatch) has DIFFERENT semantics:
 *   - In A/B mode: Controls single foreground colorScale (contact data color)
 *   - In AOB/BOA mode: Controls positive ratio color (ratioColorScale.positiveScale)
 * 
 * The widget adapts its behavior in updateForDisplayMode() to show/hide tiles
 * and update their handlers based on the current display mode.
 * 
 * ──────────────────────────────────────────────────────────────────────────────
 * 
 * THRESHOLD ADJUSTMENT ICONS (separate from color tiles):
 *    - thresholdDecreaseIcon: Minus icon (-) that decreases threshold (multiply by 0.5)
 *    - thresholdIncreaseIcon: Plus icon (+) that increases threshold (multiply by 2.0)
 *    - These are the +/- ICONS next to the threshold input field
 */
class ColorScaleWidget {

    constructor(browser, hicNavbarContainer) {
        this.browser = browser;

        const container = hicNavbarContainer.querySelector("div[id$='lower-hic-nav-bar-widget-container']");

        this.container = document.createElement('div');
        this.container.className = 'hic-colorscale-widget-container';
        container.appendChild(this.container);

        // BLUE TILE: Background color picker (always visible)
        // This controls the background color of the contact matrix (the "empty" areas between contacts)
        const { r: _r, g: _g, b: _b } = ContactMatrixView.defaultBackgroundColor;
        this.backgroundColorSwatch = colorSwatch(IGVColor.rgbColor(_r, _g, _b));
        this.container.appendChild(this.backgroundColorSwatch);
        this.backgroundColorPicker = createColorPicker(browser, this.backgroundColorSwatch);

        // BLUE TILE (hidden in A/B modes): Negative ratio color swatch
        // Only visible in AOB/BOA modes to control the blue color for ratios < 1 (depleted regions)
        const { r: nr, g: ng, b: nb } = defaultRatioColorScaleConfig.negative;
        this.negativeRatioColorSwatch = colorSwatch(IGVColor.rgbColor(nr, ng, nb));
        this.container.appendChild(this.negativeRatioColorSwatch);
        this.negativeRatioColorPicker = createColorPicker(browser, this.negativeRatioColorSwatch, '-');
        this.negativeRatioColorSwatch.style.display = 'none';

        // RED TILE: Foreground color picker (always visible in A/B modes)
        // In A/B modes: Controls the foreground/contact color scale (the color of the contact data)
        // In AOB/BOA modes: Controls the red color for ratios > 1 (enriched regions)
        const { r, g, b } = defaultRatioColorScaleConfig.positive;
        this.foregroundColorSwatch = colorSwatch(IGVColor.rgbColor(r, g, b));
        this.container.appendChild(this.foregroundColorSwatch);
        this.foregroundColorPicker = createColorPicker(browser, this.foregroundColorSwatch, '+');

        this.negativeRatioColorSwatch.addEventListener('click', () => presentColorPicker(this.negativeRatioColorPicker, this.foregroundColorPicker, this.backgroundColorPicker));
        this.foregroundColorSwatch.addEventListener('click', () => presentColorPicker(this.foregroundColorPicker, this.negativeRatioColorPicker, this.backgroundColorPicker));
        this.backgroundColorSwatch.addEventListener('click', () => presentColorPicker(this.backgroundColorPicker, this.negativeRatioColorPicker, this.foregroundColorPicker));

        this.highColorscaleInput = document.createElement('input');
        this.highColorscaleInput.type = 'text';
        this.highColorscaleInput.title = 'color scale input';
        this.container.appendChild(this.highColorscaleInput);
        this.highColorscaleInput.addEventListener('change', (e) => {
            const numeric = StringUtils.numberUnFormatter(e.target.value);
            if (!isNaN(numeric)) {
                browser.setColorScaleThreshold(numeric);
            }
        });

        // Threshold adjustment buttons: +/- icons that adjust the threshold value
        // These are separate from the color swatches above
        const thresholdDecreaseIcon = createIconButton('fa-minus', 'Decrease threshold (multiply by 0.5)', () => this.highColorscaleInput.value = updateThreshold(browser, 0.5));
        this.container.appendChild(thresholdDecreaseIcon);

        const thresholdIncreaseIcon = createIconButton('fa-plus', 'Increase threshold (multiply by 2.0)', () => this.highColorscaleInput.value = updateThreshold(browser, 2.0));
        this.container.appendChild(thresholdIncreaseIcon);

        browser.eventBus.subscribe("ColorScale", (event) => {
            if (event.data instanceof ColorScale) {
                // A/B mode: Update foreground color swatch (red tile)
                this.highColorscaleInput.value = event.data.threshold;
                paintSwatch(this.foregroundColorSwatch, event.data);
            } else if (event.data instanceof RatioColorScale) {
                // AOB/BOA mode: Update both ratio color swatches
                this.highColorscaleInput.value = event.data.threshold;
                paintSwatch(this.negativeRatioColorSwatch, event.data.negativeScale);
                paintSwatch(this.foregroundColorSwatch, event.data.positiveScale);
            }
        });

        // Note: DisplayMode events are handled via NotificationCoordinator.notifyDisplayMode()
        // which calls updateForDisplayMode() directly. Event bus subscription removed to eliminate
        // duplicate notification paths.

        browser.eventBus.subscribe("MapLoad", () => {
            // Update background color swatch to show the background for current display mode
            const currentBackgroundColor = browser.contactMatrixView.getBackgroundColor();
            paintSwatch(this.backgroundColorSwatch, currentBackgroundColor);
        });
    }

    /**
     * Update the map background color swatch (blue tile).
     * @param {{r: number, g: number, b: number}} backgroundColor - RGB color object
     */
    updateMapBackgroundColor(backgroundColor) {
        if (this.backgroundColorSwatch) {
            paintSwatch(this.backgroundColorSwatch, backgroundColor);
        }
    }

    /**
     * Update the widget for display mode changes.
     * 
     * THIS IS WHERE THE SEMANTICS CHANGE: The same UI tiles mean different things
     * depending on whether we're in single map mode (A/B) vs ratio mode (AOB/BOA).
     * 
     * Display modes:
     * - 'A': Contact Map (main/primary dataset) - uses single colorScale
     * - 'B': Control Map (secondary/comparison dataset) - uses same single colorScale
     * - 'AOB': Ratio mode showing Contact Map / Control Map - uses ratioColorScale (separate from single colorScale)
     * - 'BOA': Ratio mode showing Control Map / Contact Map - uses ratioColorScale (separate from single colorScale)
     * 
     * @param {string} mode - Display mode ("AOB", "BOA", "A", or "B")
     * @param {RatioColorScale} ratioColorScale - Ratio color scale for AOB/BOA modes (distinct from single colorScale)
     * @param {ColorScale} colorScale - Single color scale used for both A and B modes
     */
    updateForDisplayMode(mode, ratioColorScale, colorScale) {
        if (!this.negativeRatioColorSwatch || !this.foregroundColorSwatch) {
            return;
        }

        if (mode === "AOB" || mode === "BOA") {
            // ═══════════════════════════════════════════════════════════════
            // RATIO MODE: Show 3 tiles [BACKGROUND] [NEGATIVE] [POSITIVE]
            // ═══════════════════════════════════════════════════════════════
            // Show the negative ratio swatch (blue tile for depleted regions)
            this.negativeRatioColorSwatch.style.display = 'block';
            
            // Update tiles to show ratio colors (separate from single colorScale)
            // [BLUE TILE] = negativeRatioColorSwatch → ratioColorScale.negativeScale
            paintSwatch(this.negativeRatioColorSwatch, ratioColorScale.negativeScale);
            
            // [RED TILE] = foregroundColorSwatch → ratioColorScale.positiveScale
            // NOTE: Same tile as A/B mode, but now controls positive ratio color!
            paintSwatch(this.foregroundColorSwatch, ratioColorScale.positiveScale);
        } else {
            // ═══════════════════════════════════════════════════════════════
            // SINGLE MAP MODE (A or B): Show 2 tiles [BACKGROUND] [FOREGROUND]
            // ═══════════════════════════════════════════════════════════════
            // Hide the negative ratio swatch (not needed in single map mode)
            this.negativeRatioColorSwatch.style.display = 'none';
            
            // [RED TILE] = foregroundColorSwatch → single colorScale (for contact data)
            // NOTE: Same tile as ratio mode, but now controls foreground color scale!
            paintSwatch(this.foregroundColorSwatch, colorScale);
        }
        
        // [BLUE/GRAY TILE] = backgroundColorSwatch → always controls background (same in all modes)
        const backgroundColor = this.browser.contactMatrixView.getBackgroundColor();
        paintSwatch(this.backgroundColorSwatch, backgroundColor);
    }

    /**
     * Update the widget for color scale changes.
     * Handles both standard ColorScale and RatioColorScale instances.
     * @param {ColorScale|RatioColorScale} colorScale - The color scale to display
     */
    updateForColorScale(colorScale) {
        if (!this.highColorscaleInput || !this.foregroundColorSwatch) {
            return;
        }

        if (colorScale instanceof ColorScale) {
            // A/B mode: Update the foreground color swatch (red tile)
            this.highColorscaleInput.value = colorScale.threshold;
            paintSwatch(this.foregroundColorSwatch, colorScale);
        } else if (colorScale instanceof RatioColorScale) {
            // AOB/BOA mode: Update both ratio color swatches
            this.highColorscaleInput.value = colorScale.threshold;
            if (this.negativeRatioColorSwatch) {
                paintSwatch(this.negativeRatioColorSwatch, colorScale.negativeScale);
            }
            paintSwatch(this.foregroundColorSwatch, colorScale.positiveScale);
        }
    }
}

function paintSwatch(swatch, { r, g, b }) {
    swatch.style.backgroundColor = IGVColor.rgbToHex(IGVColor.rgbColor(r, g, b));
}

/**
 * Update color scale threshold by a scale factor.
 * Uses the color scale for the current display mode (Contact Map for A, Control Map for B, Ratio for AOB/BOA).
 */
function updateThreshold(browser, scaleFactor) {
    const colorScale = browser.getColorScale();
    browser.setColorScaleThreshold(colorScale.getThreshold() * scaleFactor);
    return StringUtils.numberFormatter(colorScale.getThreshold());
}

/**
 * Create a color picker for a color swatch.
 * 
 * The handler behavior adapts based on the 'type' parameter:
 * 
 * @param {HICBrowser} browser - Browser instance
 * @param {HTMLElement} parent - Parent element (the color swatch)
 * @param {string|undefined} type - Determines which color scale to update:
 *   - undefined: Background color picker (always controls background, same in all modes)
 *   - '+': Foreground/positive color picker (semantics change by mode!)
 *          * A/B mode: Updates single colorScale (foreground contact data color)
 *          * AOB/BOA mode: Updates ratioColorScale.positiveScale (positive ratio color)
 *   - '-': Negative ratio color picker (only used in AOB/BOA mode)
 *          * Updates ratioColorScale.negativeScale (negative ratio color)
 */
function createColorPicker(browser, parent, type) {
    let defaultColors, colorHandler;
    if (!type) {
        // ═══════════════════════════════════════════════════════════════
        // BACKGROUND COLOR PICKER (type = undefined)
        // ═══════════════════════════════════════════════════════════════
        // Always controls background color (same in all display modes)
        const { r, g, b } = ContactMatrixView.defaultBackgroundColor;
        defaultColors = [IGVColor.rgbToHex(IGVColor.rgbColor(r, g, b))];
        colorHandler = (hex) => {
            parent.style.backgroundColor = hex;
            const rgbString = IGVColor.hexToRgb(hex)
            const [r, g, b] = parseRgbString(rgbString)
            // Background color is shared across all modes (A, B, AOB, BOA)
            browser.contactMatrixView.setBackgroundColor({ r, g, b });
        };
    } else {
        // ═══════════════════════════════════════════════════════════════
        // FOREGROUND/RATIO COLOR PICKER (type = '+' or '-')
        // ═══════════════════════════════════════════════════════════════
        // The handler adapts: browser.getColorScale() returns the appropriate scale
        // based on current display mode (single colorScale for A/B, ratioColorScale for AOB/BOA)
        defaultColors = [defaultRatioColorScaleConfig.negative, defaultRatioColorScaleConfig.positive].map(({ r, g, b }) => IGVColor.rgbToHex(IGVColor.rgbColor(r, g, b)));
        colorHandler = (hex) => {
            parent.style.backgroundColor = hex;
            const rgbString = IGVColor.hexToRgb(hex)
            const [r, g, b] = parseRgbString(rgbString)
            // getColorScale() intelligently returns:
            //   - Single colorScale for A/B modes (foreground contact data)
            //   - ratioColorScale for AOB/BOA modes (positive/negative ratios)
            // The 'type' parameter ('+' or '-') determines which part of the scale to update
            browser.getColorScale().setColorComponents({ r, g, b }, type);
            browser.repaintMatrix();
        };
    }
    return new ColorPicker({ parent, top: 64, left: 64, width: 432, defaultColors, colorHandler });
}

function presentColorPicker(presentable, hideableA, hideableB) {
    hideableA.hide()
    hideableB.hide()
    presentable.show()
}

function colorSwatch(rgbString) {
    const swatch = DOMUtils.div({ class: 'igv-ui-color-swatch' });
    swatch.style.backgroundColor = IGVColor.rgbToHex(rgbString);
    return swatch;
}

function createIconButton(iconClass, title, onClick) {
    const icon = document.createElement('i');
    icon.className = `fa ${iconClass}`;
    icon.title = title;
    icon.addEventListener('click', onClick);
    return icon;
}

export default ColorScaleWidget;
