import { Router } from "express";
import passport from "passport";

import { getPoseInsights, getWeeklyInsights } from "./controllers/ai.js";

const router = Router();

router.post('/pose-insights/:id', passport.authenticate('jwt',{session: false}), getPoseInsights);
router.post('/weekly-insights', passport.authenticate('jwt',{session: false}), getWeeklyInsights);

export default router;