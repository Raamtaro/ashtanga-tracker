import Router from "express";
import { signup, loginUser, getAllUsers, deleteAccount } from "./controllers/auth";

const router = Router();

router.post('/signup', signup);
router.post('/login', loginUser);
router.delete('/delete', deleteAccount);

router.get('/all', getAllUsers)

export default router;