require("dotenv").config();
const express = require("express"), cors = require("cors"), jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") })); app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("kindnest"), events = db.collection("events"), joins = db.collection("joins");
const bad = (res, m, c = 400) => res.status(c).json({ message: m });
const oid = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// JWT guard: token is signed by the Next.js app after BetterAuth confirms the session
const verify = (req, res, next) => {
  const t = req.headers.authorization?.split(" ")[1];
  if (!t) return bad(res, "Please log in to continue.", 401);
  try { req.email = jwt.verify(t, process.env.JWT_SECRET).email; next(); }
  catch { bad(res, "Your session has expired. Log in again.", 403); }
};

app.get("/", (_, r) => r.send("KindNest API is running"));

client.connect().then(() => app.listen(process.env.PORT || 5000, () => console.log("API ready")));
module.exports = app;
