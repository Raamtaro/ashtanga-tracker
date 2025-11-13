import express from "express";
import dotenv from 'dotenv';
dotenv.config();
const app = express();
const port = 3000;
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).send("Something Broke!");
});
app.listen(port, () => {
    console.log(`listening on port: ${port}`);
});
