/* eslint-disable import/extensions */
import { v4 as uuidv4 } from 'uuid';
import sha1 from 'sha1';
import redisClient from '../utils/redis.mjs';
import dbClient from '../utils/db.mjs';

class AuthController {
  static async getConnect(req, res) {
    try {
      // Get the Authorization header
      const authHeader = req.headers.authorization;

      if (!authHeader || !authHeader.startsWith('Basic ')) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Extract the base64 encoded credentials
      const base64Credentials = authHeader.split(' ')[1];
      const credentials = Buffer.from(base64Credentials, 'base64').toString(
        'ascii',
      );
      const [email, password] = credentials.split(':');

      if (!email || !password) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Check if database is connected
      if (!dbClient.isAlive()) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      // Hash the password to compare with stored hash
      const hashedPassword = sha1(password);

      // Find user with matching email and password
      const user = await dbClient.db.collection('users').findOne({
        email,
        password: hashedPassword,
      });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Generate a random token using uuidv4
      const token = uuidv4();

      // Create Redis key for the token
      const key = `auth_${token}`;

      // Store user ID in Redis for 24 hours (86400 seconds)
      await redisClient.set(key, user._id.toString(), 86400);

      // Return the token
      return res.status(200).json({ token });
    } catch (error) {
      console.error('Error in getConnect:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getDisconnect(req, res) {
    try {
      // Get the X-Token header
      const token = req.headers['x-token'];

      if (!token) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Create Redis key for the token
      const key = `auth_${token}`;

      // Check if token exists in Redis
      const userId = await redisClient.get(key);

      if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Delete the token from Redis
      await redisClient.del(key);

      // Return nothing with status 204
      return res.status(204).send();
    } catch (error) {
      console.error('Error in getDisconnect:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default AuthController;
