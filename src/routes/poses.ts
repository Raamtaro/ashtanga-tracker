import { Router } from "express";
import {getAllPoses} from "./controllers/poses"
import passport from "passport";

const router = Router();

//Quick grab all route

router.get('/', passport.authenticate('jwt',{session: false}), getAllPoses);

export default router;