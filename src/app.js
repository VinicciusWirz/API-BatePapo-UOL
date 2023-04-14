import express from "express";
import cors from "cors";
import { MongoClient } from "mongodb";
import dotenv from "dotenv";
import Joi from "joi";
import dayjs from "dayjs";

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
  const name = req.body.name;
  const { error, value } = signUpSchema.validate({ name });
  const regex = new RegExp(`^${name}$`, "i");
  if (error) {
    return res.status(422).send(error.details);
  }
  try {
    const participantExist = await db
      .collection("participants")
      .findOne({ name: regex });
    if (participantExist) {
      return res.sendStatus(409);
    }
    db.collection("participants").insertOne({
      ...value,
      lastStatus: Date.now(),
    });
    db.collection("messages").insertOne({
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
  const user = req.headers.user;
  const { error, value } = messageSchema.validate({ to, text, type });
  if (error) {
    return res.status(422).send(error.details);
  }
  try {
    const userExists = await db
      .collection("participants")
      .findOne({ name: user });
    console.log("req.headers.user =", req.headers.user);
    if (!userExists) {
      return res.sendStatus(422);
    }
    db.collection("messages").insertOne({
      from: user,
      to,
      text,
      type,
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
  const user = req.headers.user;
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

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`));
