import express, { Express, Request, Response, NextFunction } from "express";
import routes from "./src/routes";
import dotenv from 'dotenv';

dotenv.config();

const app: Express = express();
const port: number = 3000;

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/pose', routes.poses);

app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something Broke!")
})

app.listen(port, (): void => {
    console.log(`listening on port: ${port}`)
})