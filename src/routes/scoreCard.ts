import Router from "express";
import passport from "passport";


const router = Router();


router.patch('/update', passport.authenticate('jwt',{session: false}), publishScoreCard);

export default router;
