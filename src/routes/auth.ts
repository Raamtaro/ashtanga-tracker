import Router from "express";
import { signup, loginUser, getAllUsers, deleteAccount } from "./controllers/auth";
import passport from "passport";

const router = Router();

router.post('/signup', signup);
router.post('/login', loginUser);
router.post('/delete', passport.authenticate('jwt', { session: false }), deleteAccount);

router.get('/all', getAllUsers)

export default router;