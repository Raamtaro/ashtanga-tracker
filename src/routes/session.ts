import Router from "express";
import { createPresetSession, createCustomSession,  } from "./controllers/session/create";
import { publishSession, getSessionById, getAllSessions } from "./controllers/session/basic";
import passport from "passport";

const router = Router();

router.get('/:id', passport.authenticate('jwt',{session: false}), getSessionById) //Simple Get route
router.get('/', passport.authenticate('jwt',{session: false}), getAllSessions); //Get all sessions
router.post('/preset', passport.authenticate('jwt',{session: false}), createPresetSession);
router.post('/custom', passport.authenticate('jwt',{session: false}), createCustomSession);
router.put('/:id/publish', passport.authenticate('jwt',{session: false}), publishSession);

export default router;