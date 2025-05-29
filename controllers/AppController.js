/* eslint-disable import/extensions */
import redisClient from '../utils/redis.mjs';
import dbClient from '../utils/db.mjs';

class AppController {
  static getStatus(req, res) {
    // Check if Redis and DB are alive
    const redisAlive = redisClient.isAlive();
    const dbAlive = dbClient.isAlive();

    // Return status with 200 status code
    res.status(200).json({
      redis: redisAlive,
      db: dbAlive,
    });
  }

  static async getStats(req, res) {
    try {
      // Get the number of users and files from the database
      const users = await dbClient.nbUsers();
      const files = await dbClient.nbFiles();

      // Return stats with 200 status code
      res.status(200).json({
        users,
        files,
      });
    } catch (error) {
      // Handle any errors
      res.status(500).json({ error: 'Internal server error' });
    }
  }
}

export default AppController;
