import Router from "express";
import { signup, loginUser, getAllUsers } from "./controllers/auth";

const router = Router();

router.post('/signup', signup);
router.post('/login', loginUser);

router.get('/all', getAllUsers)

export default router;