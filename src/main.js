import { Application } from './Application.js';

// Default configuration
const config = {
    backgroundColor: '255,255,255'
};

// Initialize application
const app = new Application();
app.init(document.getElementById('app-container'), config)
    .then(() => {
        console.log('Juicebox MCP application initialized');
    })
    .catch((error) => {
        console.error('Error initializing application:', error);
    });
