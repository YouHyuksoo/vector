const { pathToFileURL } = require('url');
const entryPath = require('path').join(__dirname, 'server.mjs');
import(pathToFileURL(entryPath).href).catch(err => {
  console.error('Failed to start:', err);
  process.exit(1);
});