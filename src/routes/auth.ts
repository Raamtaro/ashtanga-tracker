import Router from "express";
import { signup, getAllUsers } from "./controllers/auth";

const router = Router();

router.post('/signup', signup);
router.get('/all', getAllUsers)

export default router;