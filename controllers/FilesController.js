/* eslint-disable nonblock-statement-body-position */
/* eslint-disable curly */
/* eslint-disable import/extensions */
/* eslint-disable import/first */
import pkg from 'mongodb';

const { ObjectId } = pkg;
import { v4 as uuidv4 } from 'uuid';
import fs, { writeFileSync, mkdirSync } from 'fs';
import path from 'path';
import mime from 'mime-types';
import redisClient from '../utils/redis.mjs'; // Assuming redis.mjs is the correct extension
import dbClient from '../utils/db.mjs'; // Assuming db.mjs is the correct extension

// Define folderPath, ensuring it's created if it doesn't exist.
// process.env.FOLDER_PATH should be set in your environment, e.g., /tmp/files_manager
const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';
if (!fs.existsSync(folderPath)) {
  mkdirSync(folderPath, { recursive: true });
}

const validFileTypes = ['folder', 'file', 'image'];

class FilesController {
  static async postUpload(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    const {
      name, type, parentId = 0, isPublic = false, data,
    } = req.body;

    if (!name) return res.status(400).json({ error: 'Missing name' });
    if (!type || !validFileTypes.includes(type)) {
      return res.status(400).json({ error: 'Missing type' });
    }
    if (type !== 'folder' && !data) {
      return res.status(400).json({ error: 'Missing data' });
    }

    let parentObjId; // To store ObjectId of parent or 0
    if (parentId !== 0 && parentId !== '0') {
      // Ensure parentId is not root
      try {
        parentObjId = new ObjectId(parentId);
      } catch (err) {
        // This catch is for invalid ObjectId format.
        // The check for existence and type is done below.
        console.error('Invalid parentId format:', err);
        return res.status(400).json({ error: 'Parent not found' });
      }

      const parent = await dbClient.db
        .collection('files')
        .findOne({ _id: parentObjId, userId: new ObjectId(userId) });

      if (!parent) return res.status(400).json({ error: 'Parent not found' });
      if (parent.type !== 'folder') {
        return res.status(400).json({ error: 'Parent is not a folder' });
      }
    } else {
      parentObjId = 0; // Root parentId
    }

    const fileDocument = {
      userId: new ObjectId(userId),
      name,
      type,
      isPublic,
      parentId: parentObjId, // Use parentObjId which is either ObjectId or 0
    };

    if (type === 'folder') {
      const result = await dbClient.db
        .collection('files')
        .insertOne(fileDocument);
      return res.status(201).json({
        id: result.insertedId,
        userId: fileDocument.userId.toString(), // Return userId as string
        name: fileDocument.name,
        type: fileDocument.type,
        isPublic: fileDocument.isPublic,
        parentId:
          fileDocument.parentId === 0 ? 0 : fileDocument.parentId.toString(),
      });
    }

    // For 'file' or 'image', save to disk
    // Ensure folderPath exists (it's good practice, though done globally too)
    mkdirSync(folderPath, { recursive: true });
    const localFileName = uuidv4();
    const localPath = path.join(folderPath, localFileName);

    try {
      writeFileSync(localPath, data, { encoding: 'base64' });
    } catch (error) {
      console.error('Error writing file to disk:', error);
      return res.status(500).json({ error: 'Error saving file' });
    }

    fileDocument.localPath = localPath;

    const result = await dbClient.db
      .collection('files')
      .insertOne(fileDocument);

    return res.status(201).json({
      id: result.insertedId,
      userId: fileDocument.userId.toString(),
      name: fileDocument.name,
      type: fileDocument.type,
      isPublic: fileDocument.isPublic,
      parentId:
        fileDocument.parentId === 0 ? 0 : fileDocument.parentId.toString(),
      localPath: fileDocument.localPath, // Optionally return localPath
    });
  }

  /**
   * GET /files/:id
   * Retrieves a file document based on the ID.
   * - Validates user token.
   * - Returns 401 if user is unauthorized.
   * - Returns 404 if file is not found for the user and ID.
   * - Otherwise, returns the file document.
   */
  static async getShow(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`;
    const userId = await redisClient.get(key);
    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      const fileId = new ObjectId(req.params.id);
      const userFile = await dbClient.db.collection('files').findOne({
        _id: fileId,
        userId: new ObjectId(userId), // Ensure the file belongs to the authenticated user
      });

      if (!userFile) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Transform the response to match expected format
      const response = {
        id: userFile._id.toString(),
        userId: userFile.userId.toString(),
        name: userFile.name,
        type: userFile.type,
        isPublic: userFile.isPublic,
        parentId: userFile.parentId === 0 ? 0 : userFile.parentId.toString(),
      };
      // For 'file' or 'image', localPath might be relevant but not typically returned in 'show'
      // If it's needed, add: if (userFile.localPath) response.localPath = userFile.localPath;

      return res.status(200).json(response);
    } catch (error) {
      // This catch handles errors like invalid ObjectId format for req.params.id
      console.error('Error in getShow:', error);
      return res.status(404).json({ error: 'Not found' }); // Or 500 for server errors
    }
  }

  /**
   * GET /files
   * Retrieves all user file documents for a specific parentId with pagination.
   * - Validates user token.
   * - Returns 401 if user is unauthorized.
   * - Filters by parentId (default 0 for root).
   * - Paginates results (20 items per page, page query param starts at 0).
   * - Returns an empty list if parentId is not linked to any user folder.
   */
  static async getIndex(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) return res.status(401).json({ error: 'Unauthorized' });

    const userId = await redisClient.get(`auth_${token}`);
    if (!userId) return res.status(401).json({ error: 'Unauthorized' });

    try {
      const parentIdQuery = req.query.parentId || '0'; // Default to '0' (string) for root
      const page = parseInt(req.query.page, 10) || 0;
      const itemsPerPage = 20;

      const filter = {
        userId: new ObjectId(userId),
      };

      if (parentIdQuery === '0') {
        filter.parentId = 0;
      } else {
        try {
          // Validate parentId is a valid ObjectId string if not '0'
          filter.parentId = new ObjectId(parentIdQuery);
        } catch (err) {
          // If parentId is not '0' and not a valid ObjectId, it's an invalid query.
          // Or, as per requirement, treat as 'not linked to any folder' -> empty list.
          return res.status(200).json([]);
        }
      }

      const pipeline = [
        { $match: filter },
        { $skip: page * itemsPerPage },
        { $limit: itemsPerPage },
        // Optionally add $project to shape the output directly in aggregation
        {
          $project: {
            _id: 0, // Exclude original _id
            id: '$_id', // Rename _id to id
            userId: '$userId',
            name: '$name',
            type: '$type',
            isPublic: '$isPublic',
            parentId: '$parentId',
            // localPath: '$localPath' // Include if needed for 'file' or 'image' types
          },
        },
      ];

      const files = await dbClient.db
        .collection('files')
        .aggregate(pipeline)
        .toArray();

      // Transform parentId and userId to string if not done in $project
      const transformedFiles = files.map((file) => ({
        ...file,
        userId: file.userId.toString(),
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      }));

      return res.status(200).json(transformedFiles);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putPublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`; // Consistent variable name
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Added try-catch for ObjectId conversion and db operations
      const fileId = req.params.id;
      const fileObjectId = new ObjectId(fileId); // Convert string ID to ObjectId

      const file = await dbClient.db.collection('files').findOne({
        _id: fileObjectId,
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      const updateResult = await dbClient.db
        .collection('files')
        .updateOne(
          { _id: fileObjectId, userId: new ObjectId(userId) },
          { $set: { isPublic: true } },
        );

      if (updateResult.matchedCount === 0) {
        // Should not happen if findOne worked, but good check
        return res.status(404).json({ error: 'Not found' });
      }

      // Fetch the updated document to return
      const updatedFile = await dbClient.db
        .collection('files')
        .findOne({ _id: fileObjectId, userId: new ObjectId(userId) });

      const response = {
        id: updatedFile._id.toString(),
        userId: updatedFile.userId.toString(),
        name: updatedFile.name,
        type: updatedFile.type,
        isPublic: updatedFile.isPublic,
        parentId:
          updatedFile.parentId === 0 ? 0 : updatedFile.parentId.toString(),
      };
      // if (updatedFile.localPath) response.localPath = updatedFile.localPath;

      return res.status(200).json(response);
    } catch (error) {
      console.error('Error in putPublish:', error);
      if (error.name === 'BSONTypeError') {
        // Error from new ObjectId(fileId) if invalid format
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async putUnpublish(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token'];
    if (!token) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const key = `auth_${token}`; // Consistent variable name
    const userId = await redisClient.get(key);

    if (!userId) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
      // Added try-catch
      const fileId = req.params.id;
      const fileObjectId = new ObjectId(fileId);

      const file = await dbClient.db.collection('files').findOne({
        _id: fileObjectId,
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      await dbClient.db
        .collection('files')
        .updateOne(
          { _id: fileObjectId, userId: new ObjectId(userId) },
          { $set: { isPublic: false } },
        );

      const updatedFile = await dbClient.db
        .collection('files')
        .findOne({ _id: fileObjectId, userId: new ObjectId(userId) });

      const response = {
        id: updatedFile._id.toString(),
        userId: updatedFile.userId.toString(),
        name: updatedFile.name,
        type: updatedFile.type,
        isPublic: updatedFile.isPublic,
        parentId:
          updatedFile.parentId === 0 ? 0 : updatedFile.parentId.toString(),
      };
      // if (updatedFile.localPath) response.localPath = updatedFile.localPath;

      return res.status(200).json(response);
    } catch (error) {
      console.error('Error in putUnpublish:', error);
      if (error.name === 'BSONTypeError') {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  // eslint-disable-next-line consistent-return
  static async getFile(req, res) {
    const token = req.headers['x-token'] || req.headers['X-Token']; // User might be authenticated
    const fileId = req.params.id;
    const { size } = req.query; // For image thumbnail support

    try {
      const fileObjectId = new ObjectId(fileId);
      const file = await dbClient.db
        .collection('files')
        .findOne({ _id: fileObjectId });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      let userIsOwner = false;
      if (token) {
        const userIdFromToken = await redisClient.get(`auth_${token}`);
        if (userIdFromToken && file.userId.toString() === userIdFromToken) {
          userIsOwner = true;
        }
      }

      if (!file.isPublic && !userIsOwner) {
        return res.status(404).json({ error: 'Not found' });
      }

      if (file.type === 'folder') {
        return res.status(400).json({ error: "A folder doesn't have content" });
      }

      let filePathToServe = file.localPath;
      // Thumbnail logic
      if (
        file.type === 'image'
        && size
        && ['500', '250', '100'].includes(size)
      ) {
        filePathToServe = `${file.localPath}_${size}`;
      }

      if (!filePathToServe || !fs.existsSync(filePathToServe)) {
        // If specific size thumbnail doesn't exist, maybe serve original? Or 404.
        // For now, strict: if expected path (original or thumbnail) doesn't exist, 404.
        return res.status(404).json({ error: 'Not found' });
      }

      const mimeType = mime.lookup(file.name) || 'application/octet-stream';
      res.setHeader('Content-Type', mimeType);

      // Send the file content
      const fileStream = fs.createReadStream(filePathToServe);
      fileStream.on('error', (err) => {
        console.error('Error streaming file:', err);
        // It's tricky to send a JSON error if headers are already sent.
        // Best to ensure existsSync check is robust.
        // If an error occurs mid-stream, the connection might just break.
        if (!res.headersSent) {
          res.status(500).json({ error: 'Error reading file' });
        } else {
          res.end(); // End the response if headers already sent
        }
      });
      fileStream.pipe(res);
    } catch (error) {
      console.error('Error in getFile:', error);
      // Handle ObjectId creation error specifically
      if (
        error.message
        && error.message.includes(
          'Argument passed in must be a single String of 12 bytes or a string of 24 hex characters',
        )
      ) {
        return res.status(404).json({ error: 'Not found' });
      }
      // Fallback for other errors
      if (!res.headersSent) {
        // Check if headers are already sent before sending another response
        return res
          .status(500)
          .json({ error: 'Internal server error or file not found' });
      }
    }
  }
}

export default FilesController;
