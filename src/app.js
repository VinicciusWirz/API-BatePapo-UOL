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

let db;
const mongoClient = new MongoClient(process.env.DATABASE_URL);
mongoClient
  .connect()
  .then(() => (db = mongoClient.db()))
  .catch((err) => console.log(err.message));

const signUpSchema = Joi.object({ name: Joi.string().required() });

app.post("/participants", (req, res) => {
  const name = req.body.name;
  const { error, value } = signUpSchema.validate(req.body);
  if (error) {
    return res.status(422).send(error.details);
  }
  db.collection("participants").findOne({name})
  .then((answer) => {
    if(answer){
      return res.sendStatus(409);
    }
    db.collection("participants").insertOne({...value, lastStatus: Date.now()});
    db.collection("messages").insertOne({from: name, to: "Todos", text: "entra na sala...", type: "status",  time: dayjs().format('HH:mm:ss')});
    return res.sendStatus(201);
  }
    )
  .catch(() => res.sendStatus(500));
});

app.get("/participants", (req, res) => {
  db.collection("participants").find().toArray()
  .then((answer) => {
    const userList = [];
    answer.forEach(user => userList.push(user.name))
    res.send(userList)
  })
  .catch(() => res.sendStatus(500));
})

const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`));
