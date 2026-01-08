import { Router } from "express";
import {getAllPoses, getPoseById, listPosesBySegment, trendPoseMetrics} from "./controllers/poses.js"
import passport from "passport";

const router = Router();

//Quick grab all route

// router.get('/', passport.authenticate('jwt',{session: false}), getAllPoses); //Added authentication middleware for testing. Commenting out temporarily to make testing easier.
router.get('/', getAllPoses); 
router.get('/segment', passport.authenticate('jwt',{session: false}), listPosesBySegment); //List poses by segment
router.get('/:id', passport.authenticate('jwt',{session: false}), getPoseById); //Get pose by id
router.get('/:id/trend', passport.authenticate('jwt',{session: false}), trendPoseMetrics); //Trend pose metrics - to be implemented

export default router;