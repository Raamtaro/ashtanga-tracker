import { Router } from "express";
import {getAllPoses, getPoseById, listPosesBySegment, getScoredPoses, trendPoseMetrics} from "./controllers/poses.js"
import passport from "passport";

const router = Router();

//Quick grab all route

// router.get('/', passport.authenticate('jwt',{session: false}), getAllPoses); //Added authentication middleware for testing. Commenting out temporarily to make testing easier.
router.get('/', getAllPoses); 
router.get('/segment', passport.authenticate('jwt',{session: false}), listPosesBySegment); //List poses by segment
router.get('/scored', passport.authenticate('jwt',{session: false}), getScoredPoses); //List poses that have been scored by the user
router.get('/:id', passport.authenticate('jwt',{session: false}), getPoseById); //Get pose by id
router.get('/:id/trend', passport.authenticate('jwt',{session: false}), trendPoseMetrics); //Trend pose metrics - to be implemented

export default router;