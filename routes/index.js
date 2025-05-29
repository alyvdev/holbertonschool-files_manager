/* eslint-disable import/extensions */
import express from 'express';
import AppController from '../controllers/AppController.js';
import UsersController from '../controllers/UsersController.js';
import AuthController from '../controllers/AuthController.js';
import FilesController from '../controllers/FilesController.js';

const router = express.Router();

// GET /status => AppController.getStatus
router.get('/status', AppController.getStatus);

// GET /stats => AppController.getStats
router.get('/stats', AppController.getStats);

// POST /users => UsersController.postNew
router.post('/users', UsersController.postNew);

// GET /connect => AuthController.getConnect
router.get('/connect', AuthController.getConnect);

// GET /disconnect => AuthController.getDisconnect
router.get('/disconnect', AuthController.getDisconnect);

// GET /users/me => UsersController.getMe
router.get('/users/me', UsersController.getMe);

// POST /files => FilesController.postUpload
router.post('/files', FilesController.postUpload);

// GET /files/:id => FilesController.getShow
router.get('/files/:id', FilesController.getShow);

// GET /files => FilesController.getIndex
router.get('/files', FilesController.getIndex);

export default router;
