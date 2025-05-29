/* eslint-disable import/extensions */
import express from 'express';
import AppController from '../controllers/AppController.js';

const router = express.Router();

// GET /status => AppController.getStatus
router.get('/status', AppController.getStatus);

// GET /stats => AppController.getStats
router.get('/stats', AppController.getStats);

export default router;
