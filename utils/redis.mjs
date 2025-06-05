import { promisify } from 'util';
import redis from 'redis';

class RedisClient {
  constructor() {
    this.client = redis.createClient();
    this.client.on('error', (error) => {
      console.log(error.message);
    });
  }

  isAlive() {
    return this.client.connected;
  }

  async get(key) {
    const getAsync = promisify(this.client.get).bind(this.client);
    const value = await getAsync(key);
    return value;
  }

  async set(key, value, duration) {
    const setAsync = promisify(this.client.set).bind(this.client);
    const expireAsync = promisify(this.client.expire).bind(this.client);
    
    await setAsync(key, value);
    await expireAsync(key, duration);
  }

  async del(key) {
    const delAsync = promisify(this.client.del).bind(this.client);
    await delAsync(key);
  }
}

const redisClient = new RedisClient();
export default redisClient;
