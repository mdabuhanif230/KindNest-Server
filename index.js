require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (_, r) => r.send("KindNest API is running"));

app.listen(process.env.PORT || 5000, () => console.log("API ready"));
module.exports = app;
