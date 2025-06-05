const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class AppController {
  static getStatus(req, res) {
    const redisStatus = redisClient.isAlive();
    const dbStatus = dbClient.isAlive();
    res.status(200).json({ redis: redisStatus, db: dbStatus });
  }

  static async getStats(req, res) {
    const users = await dbClient.nbUsers();
    const files = await dbClient.nbFiles();
    const obj = {
      users,
      files,
    };
    res.status(200).json(obj);
  }
}

module.exports = AppController;
