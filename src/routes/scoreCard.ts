import Router from "express";
import passport from "passport";
import { updateScoreCard } from "./controllers/scoreCard";


const router = Router();


router.patch('/:id', passport.authenticate('jwt',{session: false}), updateScoreCard); //Update scoreCard by id

export default router;
