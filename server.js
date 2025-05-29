/* eslint-disable import/extensions */
import express from 'express';
import routes from './routes/index.js';

// Create Express application
const app = express();

// Get port from environment variable or use default 5000
const PORT = process.env.PORT || 5000;

// Middleware to parse JSON requests
app.use(express.json());

// Load all routes from routes/index.js
app.use('/', routes);

// Start the server
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

export default app;
