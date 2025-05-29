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
}

export default FilesController;
