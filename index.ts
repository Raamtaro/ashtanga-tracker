import express, { Express, Request, Response, NextFunction } from "express";

const app: Express = express();
const port: number = 3000;


app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
    console.error(err.stack);
    res.status(500).send("Something Broke!")
})

app.listen(port, (): void => {
    console.log(`listening on port: ${port}`)
})