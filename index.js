require("dotenv").config();
const express = require("express"), cors = require("cors"), jwt = require("jsonwebtoken");
const { MongoClient, ObjectId } = require("mongodb");
const app = express();
app.use(cors({ origin: process.env.CLIENT_URL?.split(",") })); app.use(express.json());

const client = new MongoClient(process.env.MONGODB_URI);
const db = client.db("kindnest"), events = db.collection("events"), joins = db.collection("joins");
const today = () => new Date().toISOString().slice(0, 10);
const bad = (res, m, c = 400) => res.status(c).json({ message: m });
const oid = (id) => (ObjectId.isValid(id) ? new ObjectId(id) : null);

// JWT guard: token is signed by the Next.js app after BetterAuth confirms the session
const verify = (req, res, next) => {
  const t = req.headers.authorization?.split(" ")[1];
  if (!t) return bad(res, "Please log in to continue.", 401);
  try { req.email = jwt.verify(t, process.env.JWT_SECRET).email; next(); }
  catch { bad(res, "Your session has expired. Log in again.", 403); }
};

const clean = (b) => {
  const e = {};
  for (const k of ["title", "description", "type", "thumbnail", "location", "date"]) e[k] = String(b[k] || "").trim();
  if (Object.values(e).some((v) => !v)) return { error: "Fill in every field." };
  if (e.title.length < 5) return { error: "Title needs at least 5 characters." };
  if (e.description.length < 20) return { error: "Description needs at least 20 characters." };
  if (!/^https?:\/\//.test(e.thumbnail)) return { error: "Thumbnail must be a valid image URL." };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date) || e.date <= today()) return { error: "Pick a date in the future." };
  return { e };
};

app.get("/", (_, r) => r.send("KindNest API is running"));

app.get("/events", async (req, res) => {
  const q = { date: { $gte: today() } };
  if (req.query.type) q.type = req.query.type;
  if (req.query.search) q.title = { $regex: req.query.search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), $options: "i" };
  res.json(await events.find(q).sort({ date: 1 }).limit(Number(req.query.limit) || 0).toArray());
});
app.get("/events/:id", async (req, res) => {
  const id = oid(req.params.id); if (!id) return bad(res, "Event not found.", 404);
  const ev = await events.findOne({ _id: id });
  ev ? res.json(ev) : bad(res, "Event not found.", 404);
});

client.connect().then(() => app.listen(process.env.PORT || 5000, () => console.log("API ready")));
module.exports = app;
