#!/usr/bin/env node

// Azure App Service startup script
console.log('Starting Data Extraction Node.js Application...');

// Set default port for Azure
process.env.PORT = process.env.PORT || '8080';

// Import and start the application
require('./bin/www'); 