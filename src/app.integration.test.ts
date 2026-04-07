import request from "supertest";
import { createApp } from "./app.js";

describe("app integration", () => {
    const app = createApp();

    it("responds with health payload", async () => {
        const response = await request(app).get("/health");

        expect(response.status).toBe(200);
        expect(response.body.ok).toBe(true);
        expect(typeof response.body.env).toBe("string");
        expect(typeof response.body.time).toBe("string");
        expect(typeof response.body.uptime).toBe("number");
    });

    it("returns 400 for signup when required fields are missing", async () => {
        const response = await request(app)
            .post("/auth/signup")
            .send({});

        expect(response.status).toBe(400);
        expect(response.body).toEqual({
            error: "Please include email, password and name",
        });
    });

    it("returns 401 for protected route without bearer token", async () => {
        const response = await request(app).get("/session");
        expect(response.status).toBe(401);
    });

    it("returns 404 JSON for unknown route", async () => {
        const response = await request(app).get("/not-a-route");

        expect(response.status).toBe(404);
        expect(response.body).toEqual({ error: "Not found" });
    });
});

