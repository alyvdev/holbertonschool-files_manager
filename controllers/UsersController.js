/* eslint-disable import/extensions */
import sha1 from 'sha1';
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
}

export default UsersController;
