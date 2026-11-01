require("dotenv").config({ path: ".env.local" });
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

// the raw docs sit in `variable` with categories the form doesn't know, so fold them onto TYPES
const toType = (d) => {
  const t = (d.title || "").toLowerCase();
  if (t.includes("blood")) return "Blood Donation";
  if (t.includes("tree") || t.includes("plant")) return "Plantation";
  if (t.includes("clean") || t.includes("riverbank")) return "Cleanup";
  if (t.includes("food") || t.includes("kitchen")) return "Food Drive";
  switch (d.category) {
    case "Education": case "Awareness": return "Education";
    case "Food": return "Food Drive";
    case "Environment": return "Cleanup";
    default: return "Donation";
  }
};

const seed = async () => {
  const raw = await db.collection("variable").find({}).toArray();
  if (!raw.length || await events.countDocuments()) return;
  const owner = (await db.collection("user").findOne({}))?.email || "seed@kindnest.local";
  const docs = raw.map((d) => ({
    title: String(d.title || "").trim(), description: String(d.description || "").trim(),
    type: toType(d), thumbnail: d.image || "", location: String(d.location || "").trim(), date: d.date,
    organizer: d.organizer || "", time: d.time || "", maxParticipants: d.maxParticipants || null,
    creatorEmail: owner, seeded: true, createdAt: new Date(),
  }));
  const skipped = docs.filter((d) => !(d.date > today()));
  if (skipped.length) console.log("past dates, won't list:", skipped.map((d) => d.title).join(", "));
  await events.insertMany(docs);
  console.log("Seeded " + docs.length + " events for " + owner);
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
app.post("/events", verify, async (req, res) => {
  const { e, error } = clean(req.body); if (error) return bad(res, error);
  const r = await events.insertOne({ ...e, creatorEmail: req.email, createdAt: new Date() });
  res.status(201).json({ _id: r.insertedId });
});
app.get("/my-events", verify, async (req, res) =>
  res.json(await events.find({ creatorEmail: req.email }).sort({ date: 1 }).toArray()));
app.put("/events/:id", verify, async (req, res) => {
  const id = oid(req.params.id); if (!id) return bad(res, "Event not found.", 404);
  const { e, error } = clean(req.body); if (error) return bad(res, error);
  const r = await events.updateOne({ _id: id, creatorEmail: req.email }, { $set: e });
  r.matchedCount ? res.json({ ok: true }) : bad(res, "You can only edit events you created.", 403);
});
app.delete("/events/:id", verify, async (req, res) => {
  const id = oid(req.params.id); if (!id) return bad(res, "Event not found.", 404);
  const r = await events.deleteOne({ _id: id, creatorEmail: req.email });
  if (!r.deletedCount) return bad(res, "You can only delete events you created.", 403);
  await joins.deleteMany({ eventId: req.params.id }); res.json({ ok: true });
});
app.post("/events/:id/join", verify, async (req, res) => {
  const id = oid(req.params.id); if (!id) return bad(res, "Event not found.", 404);
  const ev = await events.findOne({ _id: id });
  if (!ev) return bad(res, "Event not found.", 404);
  if (ev.date < today()) return bad(res, "This event has already happened.");
  if (await joins.findOne({ eventId: req.params.id, userEmail: req.email })) return bad(res, "You already joined this event.", 409);
  await joins.insertOne({ eventId: req.params.id, userEmail: req.email, event: ev, joinedAt: new Date() });
  res.status(201).json({ ok: true });
});
app.get("/joined", verify, async (req, res) => {
  const list = await joins.find({ userEmail: req.email }).toArray();
  res.json(list.map((j) => j.event).sort((a, b) => a.date.localeCompare(b.date)));
});

client.connect()
  .then(() => seed().catch((e) => console.error("Seed failed:", e.message)))
  .then(() => app.listen(process.env.PORT || 5000, () => console.log("API ready")))
  .catch((e) => { console.error("MongoDB connection failed:", e.message); process.exit(1); });
module.exports = app;
