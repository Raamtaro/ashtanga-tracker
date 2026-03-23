import { Router } from "express";
import passport from "passport";

import { getInsightDetail, getInsightsHistory } from "./controllers/aiInsights.js";

const router = Router();

router.get("/", passport.authenticate("jwt", { session: false }), getInsightsHistory);
router.get("/:type/:id", passport.authenticate("jwt", { session: false }), getInsightDetail);

export default router;
