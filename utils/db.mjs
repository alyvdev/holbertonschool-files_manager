import pkg from 'mongodb';

const { MongoClient } = pkg;

class DBClient {
  constructor() {
    // Get connection parameters from environment variables or use defaults
    const host = process.env.DB_HOST || 'localhost';
    const port = process.env.DB_PORT || 27017;
    const database = process.env.DB_DATABASE || 'files_manager';

    // Create the MongoDB connection URL
    const url = `mongodb://${host}:${port}`;

    // Initialize connection state
    this.client = null;
    this.db = null;
    this.connected = false;

    // Connect to MongoDB (don't await in constructor)
    this.connectToMongoDB(url, database).catch(() => {
      // Silently handle connection errors in constructor
    });
  }

  async connectToMongoDB(url, database) {
    try {
      // Create a new MongoClient
      this.client = new MongoClient(url, { useUnifiedTopology: true });

      // Connect to the MongoDB server
      await this.client.connect();

      // Get the database
      this.db = this.client.db(database);

      // Set connection state to true
      this.connected = true;
    } catch (error) {
      console.log('MongoDB connection error:', error.message);
      this.connected = false;
    }
  }

  isAlive() {
    return this.connected;
  }

  async nbUsers() {
    if (!this.isAlive()) {
      return 0;
    }
    try {
      const count = await this.db.collection('users').countDocuments();
      return count;
    } catch (error) {
      console.log('Error counting users:', error.message);
      return 0;
    }
  }

  async nbFiles() {
    if (!this.isAlive()) {
      return 0;
    }
    try {
      const count = await this.db.collection('files').countDocuments();
      return count;
    } catch (error) {
      console.log('Error counting files:', error.message);
      return 0;
    }
  }
}

// Create and export an instance of DBClient
const dbClient = new DBClient();

export default dbClient;
