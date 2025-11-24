import { Router } from "express";
import {getAllPoses, getPoseById, trendPoseMetrics} from "./controllers/poses"
import passport from "passport";

const router = Router();

//Quick grab all route

// router.get('/', passport.authenticate('jwt',{session: false}), getAllPoses); //Added authentication middleware for testing. Commenting out temporarily to make testing easier.
router.get('/', getAllPoses); 
router.get('/:id', getPoseById); //Get pose by id
router.get('/:id/trend', trendPoseMetrics); //Trend pose metrics - to be implemented

export default router;