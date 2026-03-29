import { Router } from "express";
import passport from "passport";

import { getAiQuota, getPoseInsights, getWeeklyInsights } from "./controllers/ai.js";

const router = Router();

router.get('/quota', passport.authenticate('jwt',{session: false}), getAiQuota);
router.post('/pose-insights/:id', passport.authenticate('jwt',{session: false}), getPoseInsights);
router.post('/weekly-insights', passport.authenticate('jwt',{session: false}), getWeeklyInsights);

export default router;
