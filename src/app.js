import express from "express";
import cors from "cors";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";
import { stripHtml } from "string-strip-html";

const app = express();
app.use(express.json());
app.use(cors());
dotenv.config();

const mongoClient = new MongoClient(process.env.DATABASE_URL);
try {
  await mongoClient.connect();
  console.log("MongoDB conectado");
} catch (err) {
  console.log(err.message);
}
const db = mongoClient.db();

const signUpSchema = Joi.object({ name: Joi.string().required() });
const messageSchema = Joi.object({
  to: Joi.string().required(),
  text: Joi.string().required(),
  type: Joi.string().valid("message", "private_message").required(),
});
const limitSchema = Joi.object({
  limit: Joi.number().integer().optional().min(1),
});

app.post("/participants", async (req, res) => {
  const { error, value } = signUpSchema.validate(req.body);
  if (error) return res.sendStatus(422);
  const name = stripHtml(req.body.name).result.trim();
  const regex = new RegExp(`^${name}$`, "i");

  try {
    const participantExist = await db
      .collection("participants")
      .findOne({ name: regex });
    if (participantExist) {
      return res.sendStatus(409);
    }
    await db.collection("participants").insertOne({
      name,
      lastStatus: Date.now(),
    });
    await db.collection("messages").insertOne({
      from: name,
      to: "Todos",
      text: "entra na sala...",
      type: "status",
      time: dayjs().format("HH:mm:ss"),
    });
    return res.sendStatus(201);
  } catch {
    res.sendStatus(500);
  }
});

app.get("/participants", async (req, res) => {
  try {
    const participants = await db.collection("participants").find().toArray();
    res.send(
      participants.map((p) => {
        return { name: p.name };
      })
    );
  } catch {
    res.sendStatus(500);
  }
});

app.post("/messages", async (req, res) => {
  const { to, text, type } = req.body;
  const { error, value } = messageSchema.validate({ to, text, type });
  if (error || !req.headers.user) return res.sendStatus(422);
  const sanitizedMessage = { to, text: stripHtml(text).result, type };
  const user = stripHtml(req.headers.user).result.trim();
  try {
    const userExists = await db
      .collection("participants")
      .findOne({ name: user });
    if (!userExists) {
      return res.sendStatus(422);
    }
    db.collection("messages").insertOne({
      from: user,
      ...sanitizedMessage,
      time: dayjs().format("HH:mm:ss"),
    });
    return res.sendStatus(201);
  } catch (err) {
    return res.sendStatus(500);
  }
});

app.get("/messages", async (req, res) => {
  const user = req.headers.user;
  const limit = req.query.limit;
  const { error } = limitSchema.validate({ limit });
  if (error) {
    return res.sendStatus(422);
  }
  try {
    const messages = await db
      .collection("messages")
      .find({
        $or: [
          { type: "message" },
          { type: "status" },
          {
            type: "private_message",
            $or: [
              { from: { $in: [user, "Todos"] } },
              { to: { $in: [user, "Todos"] } },
            ],
          },
        ],
      })
      .toArray();
    const lastMessages = limit ? messages.slice(-Number(limit)) : messages;
    res.send(lastMessages);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/status", async (req, res) => {
  const user = stripHtml(req.headers.user).result.trim();
  if (!user) return res.sendStatus(422);
  try {
    const userActive = await db
      .collection("participants")
      .findOne({ name: user });
    if (!user || !userActive) return res.sendStatus(404);

    const result = await db
      .collection("participants")
      .updateOne({ name: user }, { $set: { lastStatus: Date.now() } });
    if (result.matchedCount === 0) {
      return res.status(404).send("Esse usuário não existe!");
    }
    res.sendStatus(200);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.delete("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const user = req.headers.user;
  if (!req.headers.user) return res.sendStatus(401);
  const messageFilter = { _id: new ObjectId(id) };
  try {
    const message = await db.collection("messages").findOne(messageFilter);
    if (!message) return res.sendStatus(404);
    if (message.from !== user) return res.sendStatus(401);

    const result = await db.collection("messages").deleteOne(messageFilter);
    res.status(200).send("mensagem deletada com sucesso");
    if (result.deletedCount === 0) return res.sendStatus(404);
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.put("/messages/:id", async (req, res) => {
  const { id } = req.params;
  const { to, text, type } = req.body;
  const user = stripHtml(req.headers.user).result.trim();
  const sanitizedMessage = {
    to,
    text: stripHtml(text).result,
    type,
  };
  const messageFilter = { _id: new ObjectId(id) };
  const { error, value } = messageSchema.validate(sanitizedMessage);
  if (error || !req.headers.user) return res.sendStatus(422);
  try {
    const userExists = await db
      .collection("participants")
      .findOne({ name: user });
    if (!userExists) {
      return res.sendStatus(422);
    }

    const isUserOP = await db.collection("messages").findOne(messageFilter);
    if (!isUserOP) return res.sendStatus(404);
    if (isUserOP.from !== user) return res.sendStatus(401);
    await db
      .collection("messages")
      .updateOne(messageFilter, { $set: { from: user, ...sanitizedMessage } });
    res.status(200).send("OK");
  } catch (error) {
    res.status(500).send(error.message);
  }
});

const activeUsersTimer = 15000;

try {
  setInterval(async () => {
    const tenSecondsAgo = Date.now() - 10000;
    const filter = { lastStatus: { $lt: tenSecondsAgo } };
    const usersRemoved = await db
      .collection("participants")
      .find(filter)
      .toArray();
    const result = await db.collection("participants").deleteMany(filter);
    usersRemoved.forEach(async (user) => {
      const messageBody = {
        from: user.name,
        to: "Todos",
        text: "sai da sala...",
        type: "status",
        time: dayjs().format("HH:mm:ss"),
      };
      await db.collection("messages").insertOne(messageBody);
    });
  }, activeUsersTimer);
} catch (err) {
  res.status(500).send(err.message);
}

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`));
