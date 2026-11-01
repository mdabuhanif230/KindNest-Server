require("dotenv").config();
const express = require("express"), cors = require("cors");
const { MongoClient } = require("mongodb");
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") })); app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("kindnest"), events = db.collection("events"), joins = db.collection("joins");

app.get("/", (_, r) => r.send("KindNest API is running"));

client.connect().then(() => app.listen(process.env.PORT || 5000, () => console.log("API ready")));
module.exports = app;
