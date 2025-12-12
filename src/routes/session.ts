import Router from "express";
import { createPresetSession, createCustomSession,  } from "./controllers/session/create";
import { createPresetSession as createPresetV2, createCustomSession as createCustomV2 } from "./controllers/session/createV2";
import { publishSession, getSessionById, getAllSessions } from "./controllers/session/basic";
import passport from "passport";

const router = Router();

router.get('/:id', passport.authenticate('jwt',{session: false}), getSessionById) //Simple Get route
router.get('/', passport.authenticate('jwt',{session: false}), getAllSessions); //Get all sessions
router.post('/preset', passport.authenticate('jwt',{session: false}), createPresetSession);
router.post('/presetv2', passport.authenticate('jwt',{session: false}), createPresetV2);
router.post('/custom', passport.authenticate('jwt',{session: false}), createCustomSession);
router.post('/customv2', passport.authenticate('jwt',{session: false}), createCustomV2);
router.put('/:id/publish', passport.authenticate('jwt',{session: false}), publishSession);

export default router;