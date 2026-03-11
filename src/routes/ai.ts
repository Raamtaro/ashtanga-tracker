import { Router } from "express";
import passport from "passport";

import { getPoseInsights } from "./controllers/ai";

const router = Router();

router.post('/pose-insights/:id', passport.authenticate('jwt',{session: false}), getPoseInsights);

export default router;