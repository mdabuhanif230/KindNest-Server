require("dotenv").config({ path: __dirname + "/.env.local" });
const { MongoClient } = require("mongodb");

// Map the seed-data categories (and title hints) onto the 6 types the
// client's EventForm dropdown knows about, so Manage-page editing stays consistent.
const TYPES = ["Cleanup", "Plantation", "Donation", "Food Drive", "Blood Donation", "Education"];
function toType(doc) {
  const t = (doc.title || "").toLowerCase();
  if (t.includes("blood")) return "Blood Donation";
  if (t.includes("tree") || t.includes("plant")) return "Plantation";
  if (t.includes("clean") || t.includes("riverbank")) return "Cleanup";
  if (t.includes("food") || t.includes("kitchen")) return "Food Drive";
  switch (doc.category) {
    case "Education":
    case "Awareness": return "Education";
    case "Food": return "Food Drive";
    case "Environment": return "Cleanup";
    default: return "Donation";
  }
}

(async () => {
  const client = new MongoClient(process.env.MONGODB_URI);
  try {
    await client.connect();
    const db = client.db("kindnest");
    const events = db.collection("events");
    const raw = await db.collection("variable").find({}).toArray();
    if (!raw.length) { console.log("Nothing in variable collection."); return; }

    const owner = (await db.collection("user").findOne({}))?.email || "seed@kindnest.local";

    // Re-runnable: drop only previously seeded docs, never hand-made events.
    const { deletedCount } = await events.deleteMany({ seeded: true });
    if (deletedCount) console.log(`Removed ${deletedCount} previously seeded events.`);

    const docs = raw.map((d) => ({
      title: String(d.title || "").trim(),
      description: String(d.description || "").trim(),
      type: toType(d),
      thumbnail: d.image || "",
      location: String(d.location || "").trim(),
      date: d.date,                                   // YYYY-MM-DD, already future
      organizer: d.organizer || "",
      time: d.time || "",
      maxParticipants: d.maxParticipants || null,
      creatorEmail: owner,
      seeded: true,
      createdAt: new Date(),
    }));

    // Sanity: server requires future dates (date > today) to be listable.
    const today = new Date().toISOString().slice(0, 10);
    const badDates = docs.filter((d) => !(d.date > today));
    if (badDates.length) console.log("WARN past/today dates (won't show in list):", badDates.map((d) => d.title));

    const result = await events.insertMany(docs);
    console.log(`Inserted ${result.insertedCount} events into 'events', owned by ${owner}.`);

    const byType = {};
    docs.forEach((d) => { byType[d.type] = (byType[d.type] || 0) + 1; });
    console.log("By type:", byType);
  } finally {
    await client.close();
  }
})();
