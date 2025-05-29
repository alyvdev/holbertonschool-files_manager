/* eslint-disable import/extensions */
import { v4 as uuidv4 } from 'uuid';
import { ObjectId } from 'mongodb';
import fs from 'fs';
import path from 'path';
import redisClient from '../utils/redis.mjs';
import dbClient from '../utils/db.mjs';

class FilesController {
  static async postUpload(req, res) {
    try {
      // Get the X-Token header for authentication
      const token = req.headers['x-token'];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Create Redis key for the token
      const key = `auth_${token}`;

      // Get user ID from Redis
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if database is connected
      if (!dbClient.isAlive()) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      // Extract request body parameters
      // eslint-disable-next-line object-curly-newline
      const { name, type, parentId = 0, isPublic = false, data } = req.body;

      // Validate required fields
      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }

      // Validate type
      const acceptedTypes = ['folder', 'file', 'image'];
      if (!type || !acceptedTypes.includes(type)) {
        return res.status(400).json({ error: 'Missing type' });
      }

      // Validate data for non-folder types
      if (type !== 'folder' && !data) {
        return res.status(400).json({ error: 'Missing data' });
      }

      // Validate parentId if provided
      if (parentId !== 0) {
        let parentFile;
        try {
          parentFile = await dbClient.db.collection('files').findOne({
            _id: new ObjectId(parentId),
          });
        } catch (error) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        if (!parentFile) {
          return res.status(400).json({ error: 'Parent not found' });
        }

        if (parentFile.type !== 'folder') {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }

      // Create the file document
      const fileDocument = {
        userId: new ObjectId(userId),
        name,
        type,
        isPublic,
        parentId: parentId === 0 ? 0 : new ObjectId(parentId),
      };

      // If type is folder, save to DB and return
      if (type === 'folder') {
        const result = await dbClient.db
          .collection('files')
          .insertOne(fileDocument);

        return res.status(201).json({
          id: result.insertedId.toString(),
          userId,
          name,
          type,
          isPublic,
          parentId,
        });
      }

      // For file and image types, save to disk
      const folderPath = process.env.FOLDER_PATH || '/tmp/files_manager';

      // Create folder if it doesn't exist
      if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
      }

      // Generate unique filename using UUID
      const filename = uuidv4();
      const localPath = path.join(folderPath, filename);

      // Decode base64 data and save to file
      const fileContent = Buffer.from(data, 'base64');
      fs.writeFileSync(localPath, fileContent);

      // Add localPath to document
      fileDocument.localPath = localPath;

      // Save to database
      const result = await dbClient.db
        .collection('files')
        .insertOne(fileDocument);

      // Return the new file
      return res.status(201).json({
        id: result.insertedId.toString(),
        userId,
        name,
        type,
        isPublic,
        parentId,
      });
    } catch (error) {
      console.error('Error in postUpload:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getShow(req, res) {
    try {
      // Get the X-Token header for authentication
      const token = req.headers['x-token'];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Create Redis key for the token
      const key = `auth_${token}`;

      // Get user ID from Redis
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if database is connected
      if (!dbClient.isAlive()) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      // Get file ID from URL parameters
      const { id } = req.params;

      // Validate ObjectId format
      if (!ObjectId.isValid(id)) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Find file by ID and user ID
      const file = await dbClient.db.collection('files').findOne({
        _id: new ObjectId(id),
        userId: new ObjectId(userId),
      });

      if (!file) {
        return res.status(404).json({ error: 'Not found' });
      }

      // Return the file document
      return res.status(200).json({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      });
    } catch (error) {
      console.error('Error in getShow:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getIndex(req, res) {
    try {
      // Get the X-Token header for authentication
      const token = req.headers['x-token'];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Create Redis key for the token
      const key = `auth_${token}`;

      // Get user ID from Redis
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if database is connected
      if (!dbClient.isAlive()) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      // Get query parameters
      const { parentId = '0', page = '0' } = req.query;

      // Convert page to number and calculate skip
      const pageNumber = parseInt(page, 10) || 0;
      const itemsPerPage = 20;
      const skip = pageNumber * itemsPerPage;

      // Build match criteria
      const matchCriteria = {
        userId: new ObjectId(userId),
      };

      // Handle parentId
      if (parentId === '0') {
        matchCriteria.parentId = 0;
      } else if (ObjectId.isValid(parentId)) {
        matchCriteria.parentId = new ObjectId(parentId);
      } else {
        matchCriteria.parentId = parentId; // Keep as string if not valid ObjectId
      }

      // Use aggregation for pagination
      const files = await dbClient.db
        .collection('files')
        .aggregate([
          { $match: matchCriteria },
          { $skip: skip },
          { $limit: itemsPerPage },
        ])
        .toArray();

      // Format the response
      const formattedFiles = files.map((file) => ({
        id: file._id.toString(),
        userId: file.userId.toString(),
        name: file.name,
        type: file.type,
        isPublic: file.isPublic,
        parentId: file.parentId === 0 ? 0 : file.parentId.toString(),
      }));

      return res.status(200).json(formattedFiles);
    } catch (error) {
      console.error('Error in getIndex:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default FilesController;
