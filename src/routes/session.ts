import Router from "express";
import { createPresetSession, createCustomSession } from "./controllers/session";
import { create } from "domain";

const router = Router();

router.post('/preset', createPresetSession);
router.post('/custom', createCustomSession);

export default router;