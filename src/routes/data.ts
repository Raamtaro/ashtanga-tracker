import { Router } from "express";
import passport from "passport";

const router = Router();

router.get('/session', passport.authenticate('jwt', { session: false }), (req, res) => {} /**Replace with handler */);

router.get('/pose', passport.authenticate('jwt', { session: false }), (req, res) => {}/**Replace with handler */);

export default router;