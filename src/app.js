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
try{
  await mongoClient.connect()
  console.log("MongoDB conectado");
} catch(err){
  console.log(err.message);
}
const db = mongoClient.db()

const signUpSchema = Joi.object({ name: Joi.string().required() });
const messageSchema = Joi.object({ to: Joi.string().required(), text: Joi.string().required(), type: Joi.string().valid('message', 'private_message').required()})

app.post("/participants", (req, res) => {
  const name = req.body.name;
  const { error, value } = signUpSchema.validate({name});
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

app.post("/messages", async (req, res) => {
  const {to, text, type} = req.body;
  const user = req.headers.user;
  const {error, value} = messageSchema.validate({to, text, type});
  if(error){
    return res.status(422).send(error.details);
  }
  try{
    const userExists = await db.collection("participants").findOne({name: user});
    if(!userExists){
      return res.sendStatus(422);
    }
    db.collection("messages").insertOne({from: user, to, text, type, time: dayjs().format('HH:mm:ss')});
    return res.sendStatus(201) ;
  } catch(err){
    return res.sendStatus(500);
  }
})
const PORT = 5000;
app.listen(PORT, () => console.log(`Servidor iniciado na porta ${PORT}`));
