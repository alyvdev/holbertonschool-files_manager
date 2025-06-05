const { promisify } = require('util');

const redis = require('redis');

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (error) => console.log(error.message));
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    try {
      const getval = promisify(this.client.get).bind(this.client);
      const val = await getval(key);
      return val;
    } catch (error) {
      console.error('Redis get error:', error);
      return null;
    }
  }

  async set(key, val, duration) {
    await this.client.set(key, val);
    await this.client.expire(key, duration);
  }

  async del(key) {
    await this.client.del(key);
  }
}

const redisClient = new RedisClient();
module.exports = redisClient;
