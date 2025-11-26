import Router from "express";
import { createPresetSession, createCustomSession, getSessionById, getAllSessions } from "./controllers/session";


const router = Router();

router.get('/:id', getSessionById) //Simple Get route
router.get('/', getAllSessions); //Get all sessions
router.post('/preset', createPresetSession);
router.post('/custom', createCustomSession);

export default router;