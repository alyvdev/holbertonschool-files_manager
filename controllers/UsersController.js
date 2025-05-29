/* eslint-disable import/first */
/* eslint-disable import/extensions */
import sha1 from 'sha1';
import pkg from 'mongodb';

const { ObjectId } = pkg;
import redisClient from '../utils/redis.mjs';
import dbClient from '../utils/db.mjs';

class UsersController {
  static async postNew(req, res) {
    try {
      const { email, password } = req.body;

      // Check if email is provided
      if (!email) {
        return res.status(400).json({ error: 'Missing email' });
      }

      // Check if password is provided
      if (!password) {
        return res.status(400).json({ error: 'Missing password' });
      }

      // Check if database is connected
      if (!dbClient.isAlive()) {
        return res.status(500).json({ error: 'Database not connected' });
      }

      // Check if email already exists in the database
      const existingUser = await dbClient.db
        .collection('users')
        .findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'Already exist' });
      }

      // Hash the password using SHA1
      const hashedPassword = sha1(password);

      // Create the new user object
      const newUser = {
        email,
        password: hashedPassword,
      };

      // Insert the new user into the database
      const result = await dbClient.db.collection('users').insertOne(newUser);

      // Return the new user with only email and id
      return res.status(201).json({
        id: result.insertedId.toString(),
        email,
      });
    } catch (error) {
      console.error('Error creating user:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }

  static async getMe(req, res) {
    try {
      // Get the X-Token header
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

      // Find user by ID
      const user = await dbClient.db
        .collection('users')
        .findOne({ _id: new ObjectId(userId) });

      if (!user) {
        return res.status(401).json({ error: 'Unauthorized' });
      }

      // Return user object with only email and id
      return res.status(200).json({
        id: user._id.toString(),
        email: user.email,
      });
    } catch (error) {
      console.error('Error in getMe:', error);
      return res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default UsersController;
