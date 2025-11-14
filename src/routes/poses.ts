import { Router } from "express";
import {getAllPoses} from "./controllers/poses"

const router = Router();

//Quick grab all route

router.get('/', getAllPoses);

export default router;