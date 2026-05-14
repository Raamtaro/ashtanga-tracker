import { Router } from "express";
import { healthAndGutCheck, readinessCheck } from "./controllers/health.js";

const router = Router();

router.get("/", healthAndGutCheck); // Liveness endpoint
router.get("/ready", readinessCheck); // Readiness endpoint (checks DB reachability)

export default router;
