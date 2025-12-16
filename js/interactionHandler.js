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

import {DEFAULT_PIXEL_SIZE, MAX_PIXEL_SIZE} from "./hicBrowser.js"

/**
 * InteractionHandler handles all user interaction responsibilities for HICBrowser.
 * Extracted from HICBrowser to separate interaction handling concerns.
 * 
 * This class manages:
 * - Navigation (goto, setChromosomes)
 * - Zoom operations (pinchZoom, handleWheelZoom, zoomAndCenter, setZoom)
 * - Pan operations (shiftPixels)
 * - Locus parsing (parseGotoInput, parseLocusString)
 * - Zoom index finding (findMatchingZoomIndex)
 */
class InteractionHandler {

    /**
     * @param {HICBrowser} browser - The browser instance this handler serves
     */
    constructor(browser) {
        this.browser = browser;
        this.wheelZoomInProgress = false;
        this.pendingWheelZoom = null;
    }

    /**
     * Validate that the dataset is available.
     * 
     * @returns {boolean} - True if dataset is valid, false otherwise
     */
    _validateDataset() {
        if (undefined === this.browser.dataset) {
            console.warn('dataset is undefined');
            return false;
        }
        return true;
    }

    /**
     * Apply state changes and notify listeners.
     * Centralizes the common post-state-change workflow.
     * 
     * @param {Object} options - State change options
     * @param {boolean} options.resolutionChanged - Whether resolution changed
     * @param {boolean} options.chrChanged - Whether chromosome changed
     * @param {boolean} [options.dragging] - Whether currently dragging (optional)
     * @param {boolean} [options.clearCaches] - Whether to clear image caches (optional)
     * @param {Object} [options.zoomIn] - Zoom in options {anchorPx?, anchorPy?, scaleFactor?} (optional)
     * @returns {Promise<void>}
     */
    async _applyStateChange(options) {
        const { resolutionChanged, chrChanged, dragging = false, clearCaches = false, zoomIn } = options;

        if (clearCaches) {
            this.browser.contactMatrixView.clearImageCaches();
        }

        // Only use smooth zoomIn animation when resolution hasn't changed
        // Resolution changes require loading new data tiles, so smooth zoom doesn't work correctly
        // and causes visual "pops" due to binSize unit mismatches
        if (zoomIn && !resolutionChanged) {
            if (zoomIn.anchorPx !== undefined && zoomIn.anchorPy !== undefined && zoomIn.scaleFactor !== undefined) {
                await this.browser.contactMatrixView.zoomIn(zoomIn.anchorPx, zoomIn.anchorPy, zoomIn.scaleFactor);
            } else {
                await this.browser.contactMatrixView.zoomIn();
            }
        }

        const eventData = {
            state: this.browser.state,
            resolutionChanged,
            chrChanged
        };
        if (dragging) {
            eventData.dragging = dragging;
        }

        await this.browser.update();
        this.browser.notifyLocusChange(eventData);
    }

    /**
     * Navigate to a specific genomic locus.
     * 
     * @param {string|number} chr1 - Chromosome 1 name or index
     * @param {number} bpX - Start base pair for X axis
     * @param {number} bpXMax - End base pair for X axis
     * @param {string|number} chr2 - Chromosome 2 name or index
     * @param {number} bpY - Start base pair for Y axis
     * @param {number} bpYMax - End base pair for Y axis
     */
    async goto(chr1, bpX, bpXMax, chr2, bpY, bpYMax) {
        const { width, height } = this.browser.contactMatrixView.getViewDimensions();
        const { chrChanged, resolutionChanged } = await this.browser.state.updateWithLoci(
            chr1, bpX, bpXMax, chr2, bpY, bpYMax, 
            this.browser, width, height
        );

        await this._applyStateChange({
            resolutionChanged,
            chrChanged,
            clearCaches: true
        });
    }

    /**
     * Pan the view by pixel offset.
     * 
     * @param {number} dx - X pixel offset
     * @param {number} dy - Y pixel offset
     */
    async shiftPixels(dx, dy) {
        if (!this._validateDataset()) {
            return;
        }

        this.browser.state.panShift(
            dx, dy, 
            this.browser, 
            this.browser.dataset, 
            this.browser.contactMatrixView.getViewDimensions()
        );

        await this._applyStateChange({
            resolutionChanged: false,
            chrChanged: false,
            dragging: true
        });
    }

    /**
     * Handle pinch zoom gesture.
     * 
     * @param {number} anchorPx - Anchor X position in pixels
     * @param {number} anchorPy - Anchor Y position in pixels
     * @param {number} scaleFactor - Scale factor (>1 = zoom in, <1 = zoom out)
     */
    async pinchZoom(anchorPx, anchorPy, scaleFactor) {
        if (this.browser.state.chr1 === 0) {
            await this.zoomAndCenter(1, anchorPx, anchorPy);
            return;
        }

        try {
            this.browser.startSpinner();

            const bpResolutions = this.browser.getResolutions();
            const currentResolution = bpResolutions[this.browser.state.zoom];

            let newBinSize;
            let newZoom;
            let newPixelSize;
            let resolutionChanged;

            if (this.browser.resolutionLocked ||
                (this.browser.state.zoom === bpResolutions.length - 1 && scaleFactor > 1) ||
                (this.browser.state.zoom === 0 && scaleFactor < 1)) {
                // Can't change resolution level, must adjust pixel size
                newBinSize = currentResolution.binSize;
                newPixelSize = Math.min(MAX_PIXEL_SIZE, this.browser.state.pixelSize * scaleFactor);
                newZoom = this.browser.state.zoom;
                resolutionChanged = false;
            } else {
                const targetBinSize = (currentResolution.binSize / this.browser.state.pixelSize) / scaleFactor;
                newZoom = this.findMatchingZoomIndex(targetBinSize, bpResolutions);
                newBinSize = bpResolutions[newZoom].binSize;
                resolutionChanged = newZoom !== this.browser.state.zoom;
                newPixelSize = Math.min(MAX_PIXEL_SIZE, newBinSize / targetBinSize);
            }

            const z = await this.browser.minZoom(this.browser.state.chr1, this.browser.state.chr2);

            if (!this.browser.resolutionLocked && scaleFactor < 1 && newZoom < z) {
                // Zoom out to whole genome
                const xLocus = this.parseLocusString('1');
                const yLocus = { xLocus };
                await this.setChromosomes(xLocus, yLocus);
            } else {
                await this.browser.state.panWithZoom(
                    newZoom, newPixelSize, anchorPx, anchorPy, newBinSize,
                    this.browser, this.browser.dataset,
                    this.browser.contactMatrixView.getViewDimensions(),
                    bpResolutions
                );

                // Update the locus after zooming
                this.browser.state.configureLocus(
                    this.browser.dataset,
                    this.browser.contactMatrixView.getViewDimensions()
                );

                await this._applyStateChange({
                    resolutionChanged,
                    chrChanged: false,
                    zoomIn: {
                        anchorPx,
                        anchorPy,
                        scaleFactor: 1 / scaleFactor
                    }
                });
            }
        } finally {
            this.browser.stopSpinner();
        }
    }

    /**
     * Handle wheel-based zoom gesture.
     * Similar to pinchZoom but optimized for wheel events with smaller incremental steps.
     * Prevents concurrent zoom operations to avoid race conditions and discrete jumps.
     * Accumulates zoom scale factors when there are pending operations to maintain responsiveness
     * even when track rendering is slow.
     * 
     * @param {number} anchorPx - Anchor X position in pixels
     * @param {number} anchorPy - Anchor Y position in pixels
     * @param {number} scaleFactor - Scale factor (>1 = zoom in, <1 = zoom out)
     */
    async handleWheelZoom(anchorPx, anchorPy, scaleFactor) {
        if (!this._validateDataset()) {
            return;
        }

        // If a zoom operation is already in progress, accumulate the scale factor
        // This ensures that rapid wheel events don't get lost when track rendering is slow
        if (this.wheelZoomInProgress) {
            if (this.pendingWheelZoom) {
                // Accumulate scale factors multiplicatively
                // Use the most recent anchor position (where the mouse currently is)
                this.pendingWheelZoom.scaleFactor *= scaleFactor;
                this.pendingWheelZoom.anchorPx = anchorPx;
                this.pendingWheelZoom.anchorPy = anchorPy;
            } else {
                this.pendingWheelZoom = { anchorPx, anchorPy, scaleFactor };
            }
            return;
        }

        // Process zoom operations sequentially to prevent race conditions
        this.wheelZoomInProgress = true;
        try {
            await this._performWheelZoom(anchorPx, anchorPy, scaleFactor);
            
            // Process any pending zoom operation (with accumulated scale factor)
            while (this.pendingWheelZoom) {
                const pending = this.pendingWheelZoom;
                this.pendingWheelZoom = null;
                await this._performWheelZoom(pending.anchorPx, pending.anchorPy, pending.scaleFactor);
            }
        } finally {
            this.wheelZoomInProgress = false;
        }
    }

    /**
     * Internal method to perform the actual wheel zoom operation.
     * 
     * @param {number} anchorPx - Anchor X position in pixels
     * @param {number} anchorPy - Anchor Y position in pixels
     * @param {number} scaleFactor - Scale factor (>1 = zoom in, <1 = zoom out)
     */
    async _performWheelZoom(anchorPx, anchorPy, scaleFactor) {
        // Handle transition from whole genome to chromosome view
        if (this.browser.state.chr1 === 0) {
            // In whole genome view, only zoom in (jump to chromosome)
            // Zoom out doesn't make sense at whole genome level
            if (scaleFactor > 1) {
                // Use zoomAndCenter which safely handles the whole genome to chromosome transition
                // It will navigate to the chromosome under the mouse cursor
                await this.zoomAndCenter(1, anchorPx, anchorPy);
            }
            return;
        }

        try {
            this.browser.startSpinner();

            const bpResolutions = this.browser.getResolutions();
            const currentResolution = bpResolutions[this.browser.state.zoom];

            let newBinSize;
            let newZoom;
            let newPixelSize;
            let resolutionChanged;

            if (this.browser.resolutionLocked ||
                (this.browser.state.zoom === bpResolutions.length - 1 && scaleFactor > 1) ||
                (this.browser.state.zoom === 0 && scaleFactor < 1)) {
                // Can't change resolution level, must adjust pixel size
                newBinSize = currentResolution.binSize;
                newPixelSize = Math.min(MAX_PIXEL_SIZE, this.browser.state.pixelSize * scaleFactor);
                newZoom = this.browser.state.zoom;
                resolutionChanged = false;
            } else {
                const targetBinSize = (currentResolution.binSize / this.browser.state.pixelSize) / scaleFactor;
                newZoom = this.findMatchingZoomIndex(targetBinSize, bpResolutions);
                newBinSize = bpResolutions[newZoom].binSize;
                resolutionChanged = newZoom !== this.browser.state.zoom;
                newPixelSize = Math.min(MAX_PIXEL_SIZE, newBinSize / targetBinSize);
            }

            const z = await this.browser.minZoom(this.browser.state.chr1, this.browser.state.chr2);

            if (!this.browser.resolutionLocked && scaleFactor < 1 && newZoom < z) {
                // Zoom out to whole genome
                const xLocus = this.parseLocusString('All');
                const yLocus = { ...xLocus };
                await this.setChromosomes(xLocus, yLocus);
            } else {
                await this.browser.state.panWithZoom(
                    newZoom, newPixelSize, anchorPx, anchorPy, newBinSize,
                    this.browser, this.browser.dataset,
                    this.browser.contactMatrixView.getViewDimensions(),
                    bpResolutions
                );

                // Update the locus after zooming
                this.browser.state.configureLocus(
                    this.browser.dataset,
                    this.browser.contactMatrixView.getViewDimensions()
                );

                await this._applyStateChange({
                    resolutionChanged,
                    chrChanged: false,
                    zoomIn: {
                        anchorPx,
                        anchorPy,
                        scaleFactor: 1 / scaleFactor
                    }
                });
            }
        } finally {
            this.browser.stopSpinner();
        }
    }

    /**
     * Zoom and center on bins at given screen coordinates.
     * Supports double-click zoom, pinch zoom.
     * 
     * @param {number} direction - Zoom direction (>0 = zoom in, <0 = zoom out)
     * @param {number} centerPX - Screen X coordinate to center on
     * @param {number} centerPY - Screen Y coordinate to center on
     */
    async zoomAndCenter(direction, centerPX, centerPY) {
        if (!this._validateDataset()) {
            return;
        }

        if (this.browser.dataset.isWholeGenome(this.browser.state.chr1) && direction > 0) {
            // jump from whole genome to chromosome
            const genomeCoordX = centerPX * this.browser.dataset.wholeGenomeResolution / this.browser.state.pixelSize;
            const genomeCoordY = centerPY * this.browser.dataset.wholeGenomeResolution / this.browser.state.pixelSize;
            const chrX = this.browser.genome.getChromosomeForCoordinate(genomeCoordX);
            const chrY = this.browser.genome.getChromosomeForCoordinate(genomeCoordY);
            const xLocus = { chr: chrX.name, start: 0, end: chrX.size, wholeChr: true };
            const yLocus = { chr: chrY.name, start: 0, end: chrY.size, wholeChr: true };
            await this.setChromosomes(xLocus, yLocus);
        } else {
            const { width, height } = this.browser.contactMatrixView.getViewDimensions();

            const dx = centerPX === undefined ? 0 : centerPX - width / 2;
            this.browser.state.x += (dx / this.browser.state.pixelSize);

            const dy = centerPY === undefined ? 0 : centerPY - height / 2;
            this.browser.state.y += (dy / this.browser.state.pixelSize);

            const resolutions = this.browser.getResolutions();
            const directionPositive = direction > 0 && this.browser.state.zoom === resolutions[resolutions.length - 1].index;
            const directionNegative = direction < 0 && this.browser.state.zoom === resolutions[0].index;
            
            if (this.browser.resolutionLocked || directionPositive || directionNegative) {
                const minPS = await this.browser.minPixelSize(
                    this.browser.state.chr1, 
                    this.browser.state.chr2, 
                    this.browser.state.zoom
                );

                const newPixelSize = Math.max(
                    Math.min(MAX_PIXEL_SIZE, this.browser.state.pixelSize * (direction > 0 ? 2 : 0.5)), 
                    minPS
                );

                const shiftRatio = (newPixelSize - this.browser.state.pixelSize) / newPixelSize;

                this.browser.state.pixelSize = newPixelSize;

                this.browser.state.x += shiftRatio * (width / this.browser.state.pixelSize);
                this.browser.state.y += shiftRatio * (height / this.browser.state.pixelSize);

                this.browser.state.clampXY(this.browser.dataset, this.browser.contactMatrixView.getViewDimensions());
                this.browser.state.configureLocus(this.browser.dataset, { width, height });

                await this._applyStateChange({
                    resolutionChanged: false,
                    chrChanged: false
                });
            } else {
                let i;
                for (i = 0; i < resolutions.length; i++) {
                    if (this.browser.state.zoom === resolutions[i].index) break;
                }
                if (i < resolutions.length && i + direction >= 0 && i + direction < resolutions.length) {
                    const newZoom = resolutions[i + direction].index;
                    await this.setZoom(newZoom);
                }
            }
        }
    }

    /**
     * Set the current zoom state.
     * 
     * @param {number} zoom - Index to the datasets resolution array (dataset.bpResolutions)
     */
    async setZoom(zoom) {
        const resolutionChanged = await this.browser.state.setWithZoom(
            zoom, 
            this.browser.contactMatrixView.getViewDimensions(), 
            this.browser, 
            this.browser.dataset
        );

        await this._applyStateChange({
            resolutionChanged,
            chrChanged: false,
            zoomIn: {}
        });
    }

    /**
     * Set chromosome view.
     * 
     * @param {Object} xLocus - X axis locus {chr, start, end, wholeChr?}
     * @param {Object} yLocus - Y axis locus {chr, start, end, wholeChr?}
     */
    async setChromosomes(xLocus, yLocus) {
        const { index: chr1Index } = this.browser.genome.getChromosome(xLocus.chr);
        const { index: chr2Index } = this.browser.genome.getChromosome(yLocus.chr);

        this.browser.state.chr1 = Math.min(chr1Index, chr2Index);
        this.browser.state.x = 0;

        this.browser.state.chr2 = Math.max(chr1Index, chr2Index);
        this.browser.state.y = 0;

        this.browser.state.locus = {
            x: { chr: xLocus.chr, start: xLocus.start, end: xLocus.end },
            y: { chr: yLocus.chr, start: yLocus.start, end: yLocus.end }
        };

        if (xLocus.wholeChr && yLocus.wholeChr) {
            this.browser.state.zoom = await this.browser.minZoom(this.browser.state.chr1, this.browser.state.chr2);
            const minPS = await this.browser.minPixelSize(this.browser.state.chr1, this.browser.state.chr2, this.browser.state.zoom);
            this.browser.state.pixelSize = Math.min(100, Math.max(DEFAULT_PIXEL_SIZE, minPS));
        } else {
            // Whole Genome
            this.browser.state.zoom = 0;
            const minPS = await this.browser.minPixelSize(this.browser.state.chr1, this.browser.state.chr2, this.browser.state.zoom);
            this.browser.state.pixelSize = Math.max(this.browser.state.pixelSize, minPS);
        }

        await this._applyStateChange({
            resolutionChanged: true,
            chrChanged: true,
            clearCaches: true
        });
    }

    /**
     * Find the closest matching zoom index for the target resolution.
     * 
     * resolutionArray can be either:
     *   (1) an array of bin sizes
     *   (2) an array of objects with index and bin size
     * 
     * @param {number} targetResolution - Target resolution in base pairs per bin
     * @param {Array} resolutionArray - Array of resolutions
     * @returns {number} - Matching zoom index
     */
    findMatchingZoomIndex(targetResolution, resolutionArray) {
        const isObject = resolutionArray.length > 0 && resolutionArray[0].index !== undefined;
        for (let z = resolutionArray.length - 1; z > 0; z--) {
            const binSize = isObject ? resolutionArray[z].binSize : resolutionArray[z];
            const index = isObject ? resolutionArray[z].index : z;
            if (binSize >= targetResolution) {
                return index;
            }
        }
        return 0;
    }

    /**
     * Parse goto input string and navigate to the specified locus.
     * 
     * @param {string} input - Input string in format "chr:start-end" or "chr:start-end chr:start-end"
     * @returns {Promise<void>}
     */
    async parseGotoInput(input) {
        // Normalize natural language input first
        const normalized = this.normalizeLocusInput(input);
        const loci = normalized.trim().split(' ');

        // Try parsing first locus, fall back to gene lookup if it fails
        let xLocus = this.parseLocusString(loci[0]) || await this.browser.lookupFeatureOrGene(loci[0]);

        if (!xLocus) {
            console.error(`No feature found with name ${loci[0]}`);
            alert(`No feature found with name ${loci[0]}`);
            return;
        }

        // If only one locus specified, apply to both axes (chr1 and chr2)
        let yLocus = loci[1] ? this.parseLocusString(loci[1]) : { ...xLocus };
        if (!yLocus) {
            yLocus = { ...xLocus };
        }

        if (xLocus.wholeChr && yLocus.wholeChr || 'All' === xLocus.chr && 'All' === yLocus.chr) {
            await this.setChromosomes(xLocus, yLocus);
        } else {
            await this.goto(xLocus.chr, xLocus.start, xLocus.end, yLocus.chr, yLocus.start, yLocus.end);
        }
    }

    /**
     * Parse combined map loading and locus specification from natural language.
     * Extracts map criteria (lab, cell type, source) and locus from combined commands.
     * 
     * Examples:
     *   "load a map from lab X for cell type Y at locus Z"
     *   "show me maps from 4DN for K562 cells at chr1:1000-2000"
     *   "load map from ENCODE at BRCA1"
     * 
     * @param {string} input - Combined natural language command
     * @returns {Object} - Parsed result with {mapCriteria: {...}, locus: string|null}
     */
    parseMapAndLocusCommand(input) {
        if (!input || typeof input !== 'string') {
            return { mapCriteria: null, locus: null };
        }

        const normalized = input.trim().toLowerCase();
        let mapCriteria = {};
        let locus = null;

        // Common patterns for locus specification
        const locusPatterns = [
            /(?:at|to|showing|viewing|displaying)\s+(?:locus|position|region|gene|chromosome|chr)\s+(.+?)(?:\s|$)/i,
            /(?:at|to)\s+(chr\d+[:\d\-\s,KMkm]*|chromosome\s+\d+[:\d\-\s,KMkm]*|[a-z0-9]+:[0-9,\-KMkm]+)/i,
            /(?:at|to)\s+([a-z]{2,}[a-z0-9]*)/i, // Gene names (BRCA1, TP53, etc.)
        ];

        // Try to extract locus first
        for (const pattern of locusPatterns) {
            const match = normalized.match(pattern);
            if (match) {
                locus = match[1].trim();
                // Remove locus from input for map criteria extraction
                input = input.replace(match[0], '').trim();
                break;
            }
        }

        // If no explicit locus pattern found, check if the end looks like a locus
        if (!locus) {
            const locusEndPattern = /(chr\d+[:\d\-\s,KMkm]+|[a-z]{2,}[a-z0-9]*:[0-9,\-KMkm]+)$/i;
            const match = input.match(locusEndPattern);
            if (match) {
                locus = match[1].trim();
                input = input.replace(match[0], '').trim();
            }
        }

        // Extract map criteria patterns
        // Lab pattern: "from lab X", "lab X", "by lab X"
        const labPattern = /(?:from|by)\s+lab\s+([^\s]+(?:\s+[^\s]+)*?)(?:\s|$|for|at|to)/i;
        const labMatch = input.match(labPattern);
        if (labMatch) {
            mapCriteria.lab = labMatch[1].trim();
        }

        // Cell type pattern: "for cell type X", "for X cells", "cell type X", "X cells"
        const cellPattern = /(?:for|with)\s+(?:cell\s+type\s+)?([^\s]+(?:\s+[^\s]+)*?)\s+(?:cells?|cell\s+type)(?:\s|$|at|to|from)/i;
        const cellMatch = input.match(cellPattern);
        if (cellMatch) {
            mapCriteria.cellType = cellMatch[1].trim();
        } else {
            // Try simpler pattern: "for K562", "K562 cells"
            const simpleCellPattern = /(?:for|with)\s+([a-z0-9]+(?:\s+[a-z0-9]+)*?)\s+(?:cells?)(?:\s|$|at|to|from)/i;
            const simpleMatch = input.match(simpleCellPattern);
            if (simpleMatch) {
                mapCriteria.cellType = simpleMatch[1].trim();
            }
        }

        // Source pattern: "from 4DN", "from ENCODE", "4DN maps", "ENCODE data"
        const sourcePattern = /(?:from|in)\s+(4dn|encode|all)(?:\s|$|for|at|to)/i;
        const sourceMatch = input.match(sourcePattern);
        if (sourceMatch) {
            mapCriteria.source = sourceMatch[1].toLowerCase();
        }

        // Biosource/Biosample pattern: "biosource X", "biosample Y"
        const biosourcePattern = /(?:biosource|biosample)\s+([^\s]+(?:\s+[^\s]+)*?)(?:\s|$|for|at|to)/i;
        const biosourceMatch = input.match(biosourcePattern);
        if (biosourceMatch) {
            mapCriteria.biosource = biosourceMatch[1].trim();
        }

        // Assembly pattern: "hg38", "mm10", "assembly X"
        const assemblyPattern = /(?:assembly\s+)?(hg\d+|mm\d+|grch\d+)(?:\s|$|for|at|to)/i;
        const assemblyMatch = input.match(assemblyPattern);
        if (assemblyMatch) {
            mapCriteria.assembly = assemblyMatch[1].trim();
        }

        // Build search query from extracted criteria
        if (Object.keys(mapCriteria).length > 0) {
            const queryParts = [];
            if (mapCriteria.lab) queryParts.push(mapCriteria.lab);
            if (mapCriteria.cellType) queryParts.push(mapCriteria.cellType);
            if (mapCriteria.biosource) queryParts.push(mapCriteria.biosource);
            if (mapCriteria.assembly) queryParts.push(mapCriteria.assembly);
            mapCriteria.query = queryParts.join(' ');
        }

        return {
            mapCriteria: Object.keys(mapCriteria).length > 0 ? mapCriteria : null,
            locus: locus || null
        };
    }

    /**
     * Normalize natural language locus input to standard format.
     * Handles various natural language patterns and converts them to "chr:start-end" format.
     * 
     * Examples:
     *   "chromosome 1 from 1000 to 2000" -> "chr1:1000-2000"
     *   "chr1 1000-2000" -> "chr1:1000-2000"
     *   "position 1000 on chromosome 1" -> "chr1:1000-2000" (defaults to 1MB window)
     *   "chr1 starting at 1000 ending at 2000" -> "chr1:1000-2000"
     * 
     * @param {string} input - Natural language or standard locus string
     * @returns {string} - Normalized locus string in format "chr:start-end" or "chr"
     */
    normalizeLocusInput(input) {
        if (!input || typeof input !== 'string') {
            return input;
        }

        const normalized = input.trim();

        // If already in standard format (contains ":"), return as-is after basic cleanup
        if (normalized.includes(':')) {
            return normalized;
        }

        // Pattern 1: "chromosome X from Y to Z" or "chr X from Y to Z"
        // Enhanced to support natural language: "10 megabases", "25 kilobases", etc.
        let match = normalized.match(/chromosome\s+(\w+)\s+from\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)\s+to\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)/i) ||
                    normalized.match(/chr\s*(\w+)\s+from\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)\s+to\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)/i);
        if (match) {
            const chr = match[1].startsWith('chr') ? match[1] : `chr${match[1]}`;
            const start = this._parseNumber(match[2]);
            const end = this._parseNumber(match[3]);
            return `${chr}:${start}-${end}`;
        }

        // Pattern 2: "chr X Y-Z" or "chromosome X Y-Z"
        // Enhanced to support natural language units
        match = normalized.match(/(?:chromosome|chr)\s*(\w+)\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)\s*[-–—]\s*([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)/i);
        if (match) {
            const chr = match[1].startsWith('chr') ? match[1] : `chr${match[1]}`;
            const start = this._parseNumber(match[2]);
            const end = this._parseNumber(match[3]);
            return `${chr}:${start}-${end}`;
        }

        // Pattern 3: "position X on chromosome Y" or "chr Y position X"
        // Enhanced to support natural language units
        match = normalized.match(/position\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)\s+on\s+(?:chromosome|chr)\s*(\w+)/i) ||
                normalized.match(/(?:chromosome|chr)\s*(\w+)\s+position\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)/i);
        if (match) {
            const chr = (match[1] || match[2]).startsWith('chr') ? (match[1] || match[2]) : `chr${match[1] || match[2]}`;
            const position = this._parseNumber(match[2] || match[3]);
            // Default to 1MB window around the position
            const windowSize = 500000;
            const start = Math.max(0, position - windowSize);
            const end = position + windowSize;
            return `${chr}:${start}-${end}`;
        }

        // Pattern 4: "chr X starting at Y ending at Z"
        // Enhanced to support natural language units
        match = normalized.match(/(?:chromosome|chr)\s*(\w+)\s+starting\s+at\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)\s+ending\s+at\s+([\d,KMkm\s]+(?:megabase|megabases|kilobase|kilobases|mb|kb)?)/i);
        if (match) {
            const chr = match[1].startsWith('chr') ? match[1] : `chr${match[1]}`;
            const start = this._parseNumber(match[2]);
            const end = this._parseNumber(match[3]);
            return `${chr}:${start}-${end}`;
        }

        // Pattern 5: Just chromosome name (e.g., "chr1", "chromosome 1", "1", "X")
        // Only match if it looks like a chromosome name to avoid matching gene names
        // Check for: "chr" prefix followed by numbers/letters that look like chromosomes,
        // numbers only, single letters (X, Y, M), or "chromosome" keyword
        match = normalized.match(/^chromosome\s+(\w+)$/i) ||
                normalized.match(/^chr(\d+|[XYM])$/i) ||  // Only match chr followed by number or X/Y/M
                normalized.match(/^(\d+)$/) ||
                normalized.match(/^([XYM])$/i);
        if (match) {
            const chrPart = match[1] || match[0];
            // If it already starts with "chr", use as-is; otherwise add "chr" prefix
            const chr = chrPart.startsWith('chr') ? chrPart : `chr${chrPart}`;
            // Verify it's a valid chromosome before returning
            // If browser is available, check against genome; otherwise trust the pattern
            if (this.browser && this.browser.genome) {
                const chromosome = this.browser.genome.getChromosome(chr);
                if (chromosome) {
                    return chr;
                }
                // If not a valid chromosome, it might be a gene name
                // Return the chromosome part only (without "chromosome" keyword) for gene lookup
                // This handles cases like "chromosome BRCA1" -> return "BRCA1" for gene lookup
                if (normalized.match(/^chromosome\s+(\w+)$/i)) {
                    return chrPart; // Return just the part after "chromosome"
                }
                // For other patterns, return original input (might be a gene name)
                return input.trim();
            }
            // Return just chromosome name for whole chromosome view
            return chr;
        }

        // If no pattern matches, return as-is (might be gene name or already in correct format)
        return normalized;
    }

    /**
     * Parse number string with support for K, M suffixes, commas, and natural language terms.
     * 
     * @param {string} numStr - Number string (e.g., "1,000", "1M", "1000K", "1e6", "10 megabases", "25 kilobases")
     * @returns {number} - Parsed number
     */
    _parseNumber(numStr) {
        if (!numStr) return 0;
        
        // Remove commas
        let cleaned = numStr.replace(/,/g, '').trim().toLowerCase();
        
        // Handle natural language terms: "megabase", "megabases", "mb", "kilobase", "kilobases", "kb"
        // Pattern: "10 megabases" or "10 megabase" or "10 mb" or "10mb"
        const megabasePattern = /(\d+(?:\.\d+)?)\s*(?:megabase|megabases|mb)\b/i;
        const kilobasePattern = /(\d+(?:\.\d+)?)\s*(?:kilobase|kilobases|kb)\b/i;
        
        const mbMatch = cleaned.match(megabasePattern);
        if (mbMatch) {
            return Math.round(parseFloat(mbMatch[1]) * 1000000);
        }
        
        const kbMatch = cleaned.match(kilobasePattern);
        if (kbMatch) {
            return Math.round(parseFloat(kbMatch[1]) * 1000);
        }
        
        // Handle K/M suffixes (must come after word patterns to avoid conflicts)
        if (cleaned.endsWith('k') && !cleaned.endsWith('kb')) {
            return parseInt(cleaned.slice(0, -1)) * 1000;
        }
        if (cleaned.endsWith('m') && !cleaned.endsWith('mb')) {
            return parseInt(cleaned.slice(0, -1)) * 1000000;
        }
        
        // Handle scientific notation
        if (cleaned.includes('e')) {
            return parseFloat(cleaned);
        }
        
        return parseInt(cleaned, 10);
    }

    /**
     * Parse a locus string into a locus object.
     * Enhanced to handle K/M suffixes and various number formats.
     * 
     * @param {string} locus - Locus string in format "chr:start-end" or "chr"
     * @returns {Object|undefined} - Locus object {chr, start, end, wholeChr?} or undefined if invalid
     */
    parseLocusString(locus) {
        const [chrName, range] = locus.trim().toLowerCase().split(':');
        const chromosome = this.browser.genome.getChromosome(chrName);

        if (!chromosome) {
            return undefined;
        }

        const locusObject = {
            chr: chromosome.name,
            wholeChr: (undefined === range && 'All' !== chromosome.name)
        };

        if (true === locusObject.wholeChr || 'All' === chromosome.name) {
            // Chromosome name only or All: Set to whole range
            locusObject.start = 0;
            locusObject.end = chromosome.size;
        } else {
            const [startStr, endStr] = range.split('-').map(part => part.replace(/,/g, '').trim());

            // Parse numbers with support for K/M suffixes
            const startNum = startStr ? this._parseNumber(startStr) : undefined;
            const endNum = endStr ? this._parseNumber(endStr) : undefined;

            // Internally, loci are 0-based.
            locusObject.start = (startNum !== undefined && !isNaN(startNum)) ? startNum - 1 : undefined;
            locusObject.end = (endNum !== undefined && !isNaN(endNum)) ? endNum : undefined;
        }

        return locusObject;
    }

    /**
     * Parse locus input flexibly, accepting both string and object formats.
     * This is the main entry point for MCP server commands and other programmatic access.
     * 
     * Supports:
     * - String input (natural language or standard format): "chr1:1000-2000", "BRCA1", "chromosome 1 from 1000 to 2000"
     * - Object input: {chr: "chr1", start: 1000, end: 2000}
     * - Single chromosome applies to both axes (chr1 and chr2)
     * 
     * @param {string|Object} input - Locus input (string or object)
     * @returns {Promise<void>}
     */
    async parseLocusInputFlexible(input) {
        // Handle structured object input
        if (typeof input === 'object' && input !== null) {
            if (input.chr) {
                // Single chromosome specified - apply to both axes
                const xLocus = {
                    chr: input.chr,
                    start: input.start !== undefined ? input.start : 0,
                    end: input.end !== undefined ? input.end : undefined,
                    wholeChr: input.start === undefined && input.end === undefined
                };
                
                // If whole chromosome, get the size
                if (xLocus.wholeChr) {
                    const chromosome = this.browser.genome.getChromosome(xLocus.chr);
                    if (chromosome) {
                        xLocus.start = 0;
                        xLocus.end = chromosome.size;
                    }
                }
                
                const yLocus = { ...xLocus };
                
                if (xLocus.wholeChr) {
                    await this.setChromosomes(xLocus, yLocus);
                } else {
                    await this.goto(xLocus.chr, xLocus.start, xLocus.end, yLocus.chr, yLocus.start, yLocus.end);
                }
                return;
            }
        }

        // Handle string input - normalize natural language first
        if (typeof input === 'string') {
            const normalized = this.normalizeLocusInput(input);
            await this.parseGotoInput(normalized);
            return;
        }

        // Invalid input format
        console.error('Invalid locus input format. Expected string or object with chr property.');
        throw new Error('Invalid locus input format');
    }
}

export default InteractionHandler;

