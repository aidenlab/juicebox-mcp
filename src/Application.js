import juicebox from '../js/index.js';
import { WebSocketClient } from './WebSocketClient.js';
import ColorScale from '../js/colorScale.js';
import ContactMatrixView from '../js/contactMatrixView.js';

/**
 * Main application class that orchestrates Juicebox and WebSocket communication
 */
export class Application {
  async init(container, config = {}) {
    this.container = container;
    this.config = config;
    this.browser = null;
    
    // Initialize command handler map
    this._initCommandHandlers();
    
    // Initialize Juicebox
    await this._initJuicebox(config);
    
    // Set up WebSocket connection
    this._setupWebSocket();
  }

  /**
   * Initialize Juicebox browser
   */
  async _initJuicebox(config) {
    // Use default config if none provided
    const defaultConfig = {
      backgroundColor: '255,255,255',
      ...config
    };
    
    // Initialize Juicebox
    await juicebox.init(this.container, defaultConfig);
    // Get the browser instance after initialization
    this.browser = juicebox.getCurrentBrowser();
    console.log(`Juicebox browser initialized: ${this.browser?.id || 'unknown'}`);
  }

  /**
   * Initialize the command handler map for WebSocket commands
   */
  _initCommandHandlers() {
    this.commandHandlers = new Map([
      ['toolCall', (command) => {
        this._showToolNotification(command.toolName);
      }],
      ['loadMap', async (command) => {
        await this._loadMap(command);
      }],
      ['loadControlMap', async (command) => {
        await this._loadControlMap(command);
      }],
      ['loadSession', async (command) => {
        await this._loadSession(command);
      }],
      ['zoomIn', async (command) => {
        await this._zoomIn(command);
      }],
      ['zoomOut', async (command) => {
        await this._zoomOut(command);
      }],
      ['setForegroundColor', (command) => {
        this._setForegroundColor(command);
      }],
      ['setBackgroundColor', (command) => {
        this._setBackgroundColor(command);
      }]
    ]);
  }

  /**
   * Set up WebSocket connection
   */
  _setupWebSocket() {
    // Extract session ID from URL query parameters
    const urlParams = new URLSearchParams(window.location.search);
    const sessionId = urlParams.get('sessionId');
    
    if (!sessionId) {
      // No session ID provided - app can run but without MCP connection
      console.log('No sessionId found in URL. App running in standalone mode (no MCP connection).');
      this._updateConnectionStatus(false, 'not-connected');
      return;
    }
    
    console.log(`Initializing WebSocket client with session ID: ${sessionId}`);
    
    this.wsClient = new WebSocketClient(
      (command) => {
        this._handleWebSocketCommand(command);
      },
      (connected) => {
        this._updateConnectionStatus(connected);
      },
      sessionId
    );
    this.wsClient.connect();
  }

  /**
   * Update connection status UI (if status element exists)
   */
  _updateConnectionStatus(connected, statusType = 'disconnected') {
    const statusElement = document.getElementById('ws-status');
    if (!statusElement) return;
    
    const labelElement = statusElement.querySelector('.ws-status-label');
    if (!labelElement) return;
    
    if (connected) {
      statusElement.classList.remove('disconnected', 'not-connected');
      statusElement.classList.add('connected');
      labelElement.textContent = 'connected';
    } else {
      statusElement.classList.remove('connected');
      if (statusType === 'not-connected') {
        statusElement.classList.remove('disconnected');
        statusElement.classList.add('not-connected');
        labelElement.textContent = 'not connected';
      } else {
        statusElement.classList.remove('not-connected');
        statusElement.classList.add('disconnected');
        labelElement.textContent = 'disconnected';
      }
    }
  }

  /**
   * Handle WebSocket command
   */
  async _handleWebSocketCommand(command) {
    const handler = this.commandHandlers.get(command.type);
    if (handler) {
      try {
        await handler(command);
      } catch (error) {
        console.error(`Error in handler for ${command.type}:`, error);
      }
    } else {
      console.warn('Unknown command type:', command.type);
    }
  }

  /**
   * Show tool notification
   */
  _showToolNotification(toolName) {
    // Format tool name for display (convert snake_case to Title Case)
    const formattedName = toolName
      .split('_')
      .map(word => word.charAt(0).toUpperCase() + word.slice(1))
      .join(' ');
    
    const notificationElement = document.getElementById('tool-notification');
    if (!notificationElement) return;
    
    const labelElement = notificationElement.querySelector('.tool-notification-label');
    if (!labelElement) return;
    
    // Clear any existing timeout
    if (this._toolNotificationTimeout) {
      clearTimeout(this._toolNotificationTimeout);
      this._toolNotificationTimeout = null;
    }
    
    labelElement.textContent = formattedName;
    
    // Show notification with animation
    notificationElement.classList.remove('hidden');
    notificationElement.classList.add('visible');
    
    // Hide after 3 seconds
    this._toolNotificationTimeout = setTimeout(() => {
      notificationElement.classList.remove('visible');
      notificationElement.classList.add('hidden');
      this._toolNotificationTimeout = null;
    }, 3000);
  }

  /**
   * Load a map
   */
  async _loadMap(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    const config = {
      url: command.url,
      name: command.name,
      normalization: command.normalization,
      locus: command.locus
    };

    try {
      await this.browser.loadHicFile(config);
      console.log(`Map loaded: ${command.url}`);
    } catch (error) {
      console.error('Error loading map:', error);
    }
  }

  /**
   * Load a control map
   */
  async _loadControlMap(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    const config = {
      url: command.url,
      name: command.name,
      normalization: command.normalization
    };

    try {
      // Load control map using the dedicated method
      await this.browser.loadHicControlFile(config);
      console.log(`Control map loaded: ${command.url}`);
    } catch (error) {
      console.error('Error loading control map:', error);
    }
  }

  /**
   * Load a session
   */
  async _loadSession(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    try {
      let sessionData = command.sessionData;
      
      // If sessionUrl is provided, load it
      if (command.sessionUrl) {
        const response = await fetch(command.sessionUrl);
        sessionData = await response.json();
      }

      if (sessionData) {
        await juicebox.restoreSession(this.container, sessionData);
        console.log('Session loaded');
      } else {
        console.error('No session data provided');
      }
    } catch (error) {
      console.error('Error loading session:', error);
    }
  }

  /**
   * Zoom in
   */
  async _zoomIn(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    try {
      const centerX = command.centerX;
      const centerY = command.centerY;
      
      // Use zoomAndCenter with direction > 0 for zoom in
      await this.browser.interactions.zoomAndCenter(1, centerX, centerY);
      console.log('Zoomed in');
    } catch (error) {
      console.error('Error zooming in:', error);
    }
  }

  /**
   * Zoom out
   */
  async _zoomOut(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    try {
      const centerX = command.centerX;
      const centerY = command.centerY;
      
      // Use zoomAndCenter with direction < 0 for zoom out
      await this.browser.interactions.zoomAndCenter(-1, centerX, centerY);
      console.log('Zoomed out');
    } catch (error) {
      console.error('Error zooming out:', error);
    }
  }

  /**
   * Set foreground color (color scale)
   */
  _setForegroundColor(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    try {
      const { r, g, b } = command.color;
      const threshold = command.threshold || 2000; // Default threshold
      
      // Create color scale
      const colorScale = new ColorScale({
        threshold: threshold,
        r: r,
        g: g,
        b: b
      });
      
      // Set color scale on contact matrix view
      this.browser.contactMatrixView.setColorScale(colorScale);
      this.browser.notifyColorScale(colorScale);
      
      console.log(`Foreground color set to RGB(${r}, ${g}, ${b}) with threshold ${threshold}`);
    } catch (error) {
      console.error('Error setting foreground color:', error);
    }
  }

  /**
   * Set background color
   */
  _setBackgroundColor(command) {
    if (!this.browser) {
      console.error('Browser not initialized');
      return;
    }

    try {
      const { r, g, b } = command.color;
      
      // Set background color on contact matrix view
      this.browser.contactMatrixView.setBackgroundColor({ r, g, b });
      
      console.log(`Background color set to RGB(${r}, ${g}, ${b})`);
    } catch (error) {
      console.error('Error setting background color:', error);
    }
  }

  // State management removed - commands simply update Juicebox without querying state
}

