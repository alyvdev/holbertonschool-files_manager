const { ObjectId } = require('mongodb');
const { v4: uuidv4 } = require('uuid');

const fs = require('fs');
const mime = require('mime-types');
const dbClient = require('../utils/db');
const redisClient = require('../utils/redis');

class FilesController {
  static async postUpload(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { name } = req.body;
      const { type } = req.body;
      let { parentId } = req.body;
      const { isPublic } = req.body;
      const { data } = req.body;
      const types = ['folder', 'file', 'image'];

      if (!name) {
        return res.status(400).json({ error: 'Missing name' });
      }
      if (!type || types.includes(type) === false) {
        return res.status(400).json({ error: 'Missing type' });
      }

      if (!data && type !== types[0]) {
        return res.status(400).json({ error: 'Missing data' });
      }
      if (!parentId) {
        parentId = 0;
      }
      if (parentId !== 0) {
        const search = await dbClient.db
          .collection('files')
          .find({ _id: ObjectId(parentId) })
          .toArray();
        if (search.length < 1) {
          return res.status(400).json({ error: 'Parent not found' });
        }
        if (types[0] !== search[0].type) {
          return res.status(400).json({ error: 'Parent is not a folder' });
        }
      }
      const userId = session;
      if (type === types[0]) {
        const folder = await dbClient.db.collection('files').insertOne({
          name,
          type,
          userId: ObjectId(userId),
          parentId: parentId !== 0 ? ObjectId(parentId) : 0,
          isPublic: isPublic || false,
        });
        return res.status(201).json({
          id: folder.insertedId,
          userId: ObjectId(userId),
          name,
          type,
          isPublic: isPublic || false,
          parentId: parentId !== 0 ? ObjectId(parentId) : 0,
        });
      }

      const buff = Buffer.from(data, 'base64');
      const path = process.env.FOLDER_PATH || '/tmp/files_manager';
      const newFile = uuidv4();
      const localPath = `${path}/${newFile}`;

      if (!fs.existsSync(path)) {
        fs.mkdirSync(path, { recursive: true });
      }

      try {
        fs.writeFileSync(localPath, buff);
      } catch (err) {
        return res.status(400).json({ error: err.message });
      }

      const file = await dbClient.db.collection('files').insertOne({
        name,
        type,
        userId: ObjectId(userId),
        parentId: parentId !== 0 ? ObjectId(parentId) : 0,
        isPublic: isPublic || false,
        localPath,
      });

      return res.status(201).json({
        id: file.insertedId,
        userId: ObjectId(userId),
        name,
        type,
        isPublic: isPublic || false,
        parentId: parentId !== 0 ? ObjectId(parentId) : 0,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getShow(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      let search = [];
      try {
        search = await dbClient.db
          .collection('files')
          .find({ _id: ObjectId(id), userId: ObjectId(session) })
          .toArray();
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!search || search.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.json({
        id: search[0]._id,
        userId: search[0].userId,
        name: search[0].name,
        type: search[0].type,
        isPublic: search[0].isPublic,
        parentId: search[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getIndex(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      let { parentId, page } = req.query;

      // Set default values
      if (!parentId) {
        parentId = '0';
      }
      if (!page) {
        page = 0;
      } else {
        page = parseInt(page, 10);
      }

      // Build match criteria
      const matchCriteria = {
        userId: ObjectId(session),
      };

      if (parentId === '0') {
        matchCriteria.parentId = 0;
      } else {
        try {
          matchCriteria.parentId = ObjectId(parentId);
        } catch (e) {
          matchCriteria.parentId = parentId;
        }
      }

      // Use MongoDB aggregation for pagination
      const files = await dbClient.db
        .collection('files')
        .aggregate([
          { $match: matchCriteria },
          { $skip: page * 20 },
          { $limit: 20 },
          {
            $project: {
              id: '$_id',
              userId: 1,
              name: 1,
              type: 1,
              isPublic: 1,
              parentId: 1,
              _id: 0,
            },
          },
        ])
        .toArray();

      return res.status(200).json(files);
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async putPublish(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      if (!id || id === '') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      let search = [];
      try {
        search = await dbClient.db
          .collection('files')
          .find({ _id: ObjectId(id), userId: ObjectId(session) })
          .toArray();
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!search || search.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      await dbClient.db
        .collection('files')
        .updateOne({ _id: ObjectId(id) }, { $set: { isPublic: true } });
      const search1 = await dbClient.db
        .collection('files')
        .find({ _id: ObjectId(id), userId: ObjectId(session) })
        .toArray();
      if (!search1 || search1.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json({
        id: search1[0]._id,
        userId: search1[0].userId,
        name: search1[0].name,
        type: search1[0].type,
        isPublic: search1[0].isPublic,
        parentId: search1[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async putUnpublish(req, res) {
    const key = req.header('X-Token');
    const session = await redisClient.get(`auth_${key}`);
    if (!key || key.length === 0) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
    if (session) {
      const { id } = req.params;
      if (!id || id === '') {
        return res.status(401).json({ error: 'Unauthorized' });
      }
      let search = [];
      try {
        search = await dbClient.db
          .collection('files')
          .find({ _id: ObjectId(id), userId: ObjectId(session) })
          .toArray();
      } catch (e) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (!search || search.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      await dbClient.db
        .collection('files')
        .updateOne({ _id: ObjectId(id) }, { $set: { isPublic: false } });
      const search1 = await dbClient.db
        .collection('files')
        .find({ _id: ObjectId(id), userId: ObjectId(session) })
        .toArray();
      if (!search1 || search1.length < 1) {
        return res.status(404).json({ error: 'Not found' });
      }
      return res.status(200).json({
        id: search1[0]._id,
        userId: search1[0].userId,
        name: search1[0].name,
        type: search1[0].type,
        isPublic: search1[0].isPublic,
        parentId: search1[0].parentId,
      });
    }
    return res.status(401).json({ error: 'Unauthorized' });
  }

  static async getFile(req, res) {
    const { id } = req.params;
    if (!id || id === '') {
      return res.status(404).json({ error: 'Not found' });
    }
    let search = [];
    try {
      search = await dbClient.db
        .collection('files')
        .find({ _id: ObjectId(id) })
        .toArray();
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!search || search.length < 1) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (search[0].type === 'folder') {
      return res.status(400).json({ error: "A folder doesn't have content" });
    }
    if (search[0].isPublic === false) {
      const key = req.header('X-Token');
      const session = await redisClient.get(`auth_${key}`);
      if (!key || key.length === 0) {
        return res.status(404).json({ error: 'Not found' });
      }
      if (session) {
        let search1 = [];
        try {
          search1 = await dbClient.db
            .collection('files')
            .find({ _id: ObjectId(id), userId: ObjectId(session) })
            .toArray();
        } catch (e) {
          return res.status(404).json({ error: 'Not found' });
        }
        if (!search1 || search1.length < 1) {
          return res.status(404).json({ error: 'Not found' });
        }
        if (!fs.existsSync(search1[0].localPath)) {
          return res.status(404).json({ error: 'Not found' });
        }

        const type = mime.contentType(search1[0].name);
        const charset = type.split('=')[1];
        try {
          const data = fs.readFileSync(search1[0].localPath, charset);
          return res.send(data);
        } catch (e) {
          return res.status(404).json({ error: 'Not found' });
        }
      }
      return res.status(404).json({ error: 'Not found' });
    }

    const search2 = await dbClient.db
      .collection('files')
      .find({ _id: ObjectId(id) })
      .toArray();
    if (!search2 || search2.length < 1) {
      return res.status(404).json({ error: 'Not found' });
    }
    if (!fs.existsSync(search2[0].localPath)) {
      return res.status(404).json({ error: 'Not found' });
    }
    const type = mime.contentType(search2[0].name);
    const charset = type.split('=')[1];
    try {
      const data = fs.readFileSync(search2[0].localPath, charset);
      return res.send(data);
    } catch (e) {
      return res.status(404).json({ error: 'Not found' });
    }
  }
}

module.exports = FilesController;
