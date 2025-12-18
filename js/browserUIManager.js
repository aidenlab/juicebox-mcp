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

import LocusGoto from "./hicLocusGoto.js"
import ResolutionSelector from "./hicResolutionSelector.js"
import ColorScaleWidget from "./hicColorScaleWidget.js"
import ControlMapWidget from "./controlMapWidget.js"
import NormalizationWidget from "./normalizationWidget.js"
import {getNavbarContainer} from "./layoutController.js"
import SweepZoom from "./sweepZoom.js"
import ScrollbarWidget from "./scrollbarWidget.js"
import ColorScaleManager from "./colorScaleManager.js"
import ContactMatrixView from "./contactMatrixView.js"
import ChromosomeSelector from "./chromosomeSelector.js"
import AnnotationWidget from "./annotationWidget.js"

class BrowserUIManager {
    constructor(browser) {
        this.browser = browser;
        this.components = new Map();
        this.initializeComponents();
    }

    initializeComponents() {
        const navContainer = getNavbarContainer(this.browser);

        // Navbar components
        this.components.set('locusGoto', new LocusGoto(this.browser, navContainer));

        this.components.set('resolutionSelector', new ResolutionSelector(this.browser, navContainer));
        this.getComponent('resolutionSelector').setResolutionLock(this.browser.resolutionLocked);

        this.components.set('colorScaleWidget', new ColorScaleWidget(this.browser, navContainer));

        this.components.set('controlMap', new ControlMapWidget(this.browser, navContainer));

        this.components.set('normalization', new NormalizationWidget(this.browser, navContainer));

        const chromosomeSelectorContainer = this.browser.menuElement.querySelector('.hic-chromosome-selector-widget-container');
        this.components.set('chromosomeSelector', new ChromosomeSelector(this.browser, chromosomeSelectorContainer));

        const annotationContainer = this.browser.menuElement.querySelector('.hic-annotation-presentation-button-container');
        const annotation2DWidgetConfig =
            {
                title: '2D Annotations',
                alertMessage: 'No 2D annotations currently loaded for this map'
            };
        this.components.set('annotationWidget', new AnnotationWidget(this.browser, annotationContainer, annotation2DWidgetConfig, () => this.browser.tracks2D));

        const sweepZoom = new SweepZoom(this.browser, this.browser.layoutController.getContactMatrixViewport());
        const scrollbarWidget = new ScrollbarWidget(
            this.browser,
            this.browser.layoutController.getXAxisScrollbarContainer(),
            this.browser.layoutController.getYAxisScrollbarContainer()
        );

        // Create ColorScaleManager to manage all color scales
        const colorScaleManager = new ColorScaleManager();

        this.components.set('sweepZoom', sweepZoom);
        this.components.set('scrollbar', scrollbarWidget);
        this.components.set('colorScaleManager', colorScaleManager);

        // Initialize ContactMatrixView with ColorScaleManager
        // Single background color used for all display modes
        const backgroundColor = this.browser.config.backgroundColor 
            ? (typeof this.browser.config.backgroundColor === 'string'
                ? ContactMatrixView.parseBackgroundColor(this.browser.config.backgroundColor)
                : this.browser.config.backgroundColor)
            : ContactMatrixView.defaultBackgroundColor;
        
        this.components.set('contactMatrix', new ContactMatrixView(
            this.browser,
            this.browser.layoutController.getContactMatrixViewport(),
            sweepZoom,
            scrollbarWidget,
            colorScaleManager,
            backgroundColor
        ));
    }

    getComponent(name) {
        return this.components.get(name);
    }

}

export default BrowserUIManager;
