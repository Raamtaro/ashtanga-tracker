import Router from "express";
import passport from "passport";
import { updateScoreCard,getScoreCardById } from "./controllers/scoreCard.js";


const router = Router();

router.get('/:id', passport.authenticate('jwt',{session: false}), getScoreCardById); //Get scoreCard by id
router.patch('/:id', passport.authenticate('jwt',{session: false}), updateScoreCard); //Update scoreCard by id

export default router;
