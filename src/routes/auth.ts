import Router from "express";
import { signup, loginUser, deleteAccount } from "./controllers/auth.js";
import passport from "passport";

const router = Router();

router.post('/signup', signup);
router.post('/login', loginUser);
router.post('/delete', passport.authenticate('jwt', { session: false }), deleteAccount);

export default router;
