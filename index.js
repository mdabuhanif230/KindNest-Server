
import dotenv from "dotenv";
import express from "express";
import cors from "cors";
import jwt from "jsonwebtoken";
import { MongoClient, ObjectId } from "mongodb";


dotenv.config({ path: ".env.local" });
dotenv.config();

if (!process.env.MONGODB_URI) {
  console.log("MONGODB_URI is missing.");
  process.exit(1);
}

const app = express();
const PORT = process.env.PORT || 5000;


app.use(cors({
  origin: process.env.CLIENT_URL?.split(",")
}));

app.use(express.json({ limit: "1mb" }));


const client = new MongoClient(process.env.MONGODB_URI);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("MongoDB connected successfully");
    return client;
  } catch (error) {
    console.log(error);
  }
}

const mongoClient = await connectToMongoDB();

if (!mongoClient) {
  console.log("MongoDB connection failed.");
  process.exit(1);
}

const db = mongoClient.db("kindnest");

const events = db.collection("events");
const joins = db.collection("joins");
const avatars = db.collection("avatars");


await joins
  .createIndex({ eventId: 1, userEmail: 1 }, { unique: true })
  .catch((error) => console.log("joins unique index:", error.message));


const today = () => new Date().toISOString().slice(0, 10);

const bad = (res, message, status = 400) => {
  return res.status(status).json({ message });
};

const oid = (id) => {
  return ObjectId.isValid(id) ? new ObjectId(id) : null;
};


const wrap = (handler) => (req, res, next) => {
  return Promise.resolve(handler(req, res, next)).catch(next);
};


const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];

  if (!token) {
    return bad(res, "Please log in to continue.", 401);
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.email = decoded.email;
    next();
  } catch (error) {
    return bad(res, "Your session has expired. Log in again.", 403);
  }
};


const TYPES = [
  "Cleanup",
  "Plantation",
  "Donation",
  "Food Drive",
  "Blood Donation",
  "Education"
];


const clean = (body, keepDate) => {
  const event = {};

  const fields = [
    "title",
    "description",
    "type",
    "thumbnail",
    "location",
    "date"
  ];

  for (const field of fields) {
    event[field] = String(body[field] || "").trim();
  }

  if (Object.values(event).some((value) => !value)) {
    return { error: "Fill in every field." };
  }

  if (!TYPES.includes(event.type)) {
    return { error: "Pick a valid event type." };
  }

  if (event.title.length < 5) {
    return { error: "Title needs at least 5 characters." };
  }

  if (event.description.length < 20) {
    return { error: "Description needs at least 20 characters." };
  }

  if (!/^https?:\/\//.test(event.thumbnail)) {
    return { error: "Thumbnail must be a valid image URL." };
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(event.date)) {
    return { error: "Pick a valid date." };
  }

  if (event.date <= today() && event.date !== keepDate) {
    return { error: "Pick a date in the future." };
  }

  return { e: event };
};


const toType = (data) => {

  if (data.category && TYPES.includes(data.category)) {
    return data.category;
  }

  const title = (data.title || "").toLowerCase();

  if (title.includes("blood")) {
    return "Blood Donation";
  }

  if (/\btree|\bplant/.test(title)) {
    return "Plantation";
  }

  if (title.includes("clean") || title.includes("riverbank")) {
    return "Cleanup";
  }

  if (title.includes("food") || title.includes("kitchen")) {
    return "Food Drive";
  }

  switch (data.category) {
    case "Education":
    case "Awareness":
      return "Education";

    case "Food":
      return "Food Drive";

    case "Environment":
      return "Cleanup";

    default:
      return "Donation";
  }
};


const DEMO_OWNER = "demo@kindnest.local";

const seed = async () => {

  await events.updateMany(
    { seeded: true, creatorEmail: { $ne: DEMO_OWNER } },
    { $set: { creatorEmail: DEMO_OWNER } }
  );


  const misshapen = await events
    .find({
      $or: [
        { thumbnail: { $exists: false } },
        { type: { $exists: false } },
        { category: { $exists: true } }
      ]
    })
    .toArray();

  for (const doc of misshapen) {
    await events.updateOne(
      { _id: doc._id },
      {
        $set: {
          ...(doc.thumbnail ? {} : { thumbnail: String(doc.image || "") }),
          type: toType(doc)
        }
      }
    );
  }

  const raw = await db.collection("variable").find({}).toArray();

  if (!raw.length) {
    return;
  }

  const docs = raw.map((data) => ({
    title: String(data.title || "").trim(),
    description: String(data.description || "").trim(),
    type: toType(data),
    thumbnail: data.image || "",
    location: String(data.location || "").trim(),
    date: data.date,
    organizer: data.organizer || "",
    time: data.time || "",
    maxParticipants: data.maxParticipants || null,
    creatorEmail: DEMO_OWNER,
    seeded: true,
    createdAt: new Date()
  }));

  const existing = await events
    .find({}, { projection: { title: 1 } })
    .toArray();

  const have = new Set(existing.map((event) => event.title));
  const fresh = docs.filter((doc) => !have.has(doc.title));

  if (!fresh.length) {
    return;
  }

  const skipped = fresh.filter((data) => !(data.date > today()));

  if (skipped.length) {
    console.log(
      "Past dates, won't list:",
      skipped.map((data) => data.title).join(", ")
    );
  }

  await events.insertMany(fresh);

  console.log("Seeded " + fresh.length + " new demo events");
};


app.get("/", (req, res) => {
  res.send("KindNest API is running");
});


app.get("/events", wrap(async (req, res) => {
  const query = {
    date: { $gte: today() }
  };

  if (req.query.type) {
    query.type = req.query.type;
  }

  if (req.query.search) {
    const search = req.query.search.replace(
      /[.*+?^${}()|[\]\\]/g,
      "\\$&"
    );

    query.title = {
      $regex: search,
      $options: "i"
    };
  }

  const result = await events
    .find(query)
    .sort({ date: 1 })
    .limit(Number(req.query.limit) || 0)
    .toArray();

  res.json(result);
}));


app.get("/events/:id", wrap(async (req, res) => {
  const id = oid(req.params.id);

  if (!id) {
    return bad(res, "Event not found.", 404);
  }

  const event = await events.findOne({ _id: id });

  if (!event) {
    return bad(res, "Event not found.", 404);
  }

  res.json(event);
}));


app.post("/events", verifyToken, wrap(async (req, res) => {
  const { e, error } = clean(req.body);

  if (error) {
    return bad(res, error);
  }

  const result = await events.insertOne({
    ...e,
    creatorEmail: req.email,
    createdAt: new Date()
  });

  res.status(201).json({
    _id: result.insertedId
  });
}));


app.get("/my-events", verifyToken, wrap(async (req, res) => {
  const result = await events
    .find({ creatorEmail: req.email })
    .sort({ date: 1 })
    .toArray();

  res.json(result);
}));


app.put("/events/:id", verifyToken, wrap(async (req, res) => {
  const id = oid(req.params.id);

  if (!id) {
    return bad(res, "Event not found.", 404);
  }

  const original = await events.findOne({ _id: id });

  if (!original) {
    return bad(res, "Event not found.", 404);
  }

  if (original.creatorEmail !== req.email) {
    return bad(res, "You can only edit events you created.", 403);
  }

  const { e, error } = clean(req.body, original.date);

  if (error) {
    return bad(res, error);
  }

  await events.updateOne(
    { _id: id },
    { $set: e }
  );

  res.json({ ok: true });
}));


app.delete("/events/:id", verifyToken, wrap(async (req, res) => {
  const id = oid(req.params.id);

  if (!id) {
    return bad(res, "Event not found.", 404);
  }

  const result = await events.deleteOne({
    _id: id,
    creatorEmail: req.email
  });

  if (!result.deletedCount) {
    return bad(res, "You can only delete events you created.", 403);
  }

  await joins.deleteMany({
    eventId: req.params.id
  });

  res.json({ ok: true });
}));


app.post("/events/:id/join", verifyToken, wrap(async (req, res) => {
  const id = oid(req.params.id);

  if (!id) {
    return bad(res, "Event not found.", 404);
  }

  const event = await events.findOne({ _id: id });

  if (!event) {
    return bad(res, "Event not found.", 404);
  }

  if (event.date < today()) {
    return bad(res, "This event has already happened.");
  }

  const alreadyJoined = await joins.findOne({
    eventId: req.params.id,
    userEmail: req.email
  });

  if (alreadyJoined) {
    return bad(res, "You already joined this event.", 409);
  }


  const account = await db.collection("user").findOne(
    { email: req.email },
    { projection: { name: 1 } }
  );

  try {
    await joins.insertOne({
      eventId: req.params.id,
      userEmail: req.email,
      userName: account?.name || "",
      event,
      joinedAt: new Date()
    });
  } catch (error) {

    if (error?.code === 11000) {
      return bad(res, "You already joined this event.", 409);
    }
    throw error;
  }

  res.status(201).json({ ok: true });
}));


app.get("/joined", verifyToken, wrap(async (req, res) => {
  const list = await joins
    .find({ userEmail: req.email })
    .toArray();

  const ids = list
    .map((item) => item.eventId)
    .filter((id) => ObjectId.isValid(id))
    .map((id) => new ObjectId(id));

  const currentEvents = await events
    .find({ _id: { $in: ids } })
    .toArray();

  const eventMap = new Map(
    currentEvents.map((event) => [String(event._id), event])
  );

  const result = list
    .map((item) => eventMap.get(item.eventId))
    .filter(Boolean)
    .sort((a, b) => a.date.localeCompare(b.date));

  res.json(result);
}));


const DATA_URL = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/]+={0,2})$/;


const isRealImage = (data) => {
  return (
    (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) ||

    data.subarray(0, 8).equals(
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    ) ||

    data.subarray(0, 4).toString("ascii") === "GIF8" ||

    (
      data.subarray(0, 4).toString("ascii") === "RIFF" &&
      data.subarray(8, 12).toString("ascii") === "WEBP"
    )
  );
};


app.post("/avatar", verifyToken, wrap(async (req, res) => {
  const match = DATA_URL.exec(String(req.body?.image || ""));

  if (!match) {
    return bad(
      res,
      "Send the photo as a JPEG, PNG, WebP or GIF data URL."
    );
  }

  const data = Buffer.from(match[2], "base64");

  if (!data.length || !isRealImage(data)) {
    return bad(res, "That file is not a real image.");
  }

  if (data.length > 400 * 1024) {
    return bad(res, "Photo is too large — keep it under 400KB.");
  }

  const type = `image/${match[1]}`;

  await avatars.updateOne(
    { _id: req.email },
    {
      $set: {
        image: match[2],
        type,
        updatedAt: new Date()
      }
    },
    { upsert: true }
  );

  res.json({
    path: `/avatar/${encodeURIComponent(req.email)}?v=${Date.now()}`
  });
}));


app.get("/avatar/:email", wrap(async (req, res) => {
  const avatar = await avatars.findOne({
    _id: req.params.email
  });

  if (!avatar?.image) {
    return bad(res, "No photo for that account.", 404);
  }

  res.setHeader("Content-Type", avatar.type);

  res.set("Cache-Control", "public, max-age=86400");

  res.send(Buffer.from(avatar.image, "base64"));
}));


app.use((error, req, res, next) => {
  console.log("Server error:", error.message);
  bad(res, "Something went wrong on the server. Try again.", 500);
});


await seed().catch((error) => {
  console.log("Seed failed:", error.message);
});

app.listen(PORT, () => {
  console.log("API ready on port " + PORT);
});

export default app;
